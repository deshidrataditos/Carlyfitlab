import {MemberInputError} from './member-input';
import {orderHasPlan, type StoreOrder} from './store-server';
import {addPlanDays, mexicoToday, type PlanProgressSnapshot, type PlanReviewDay} from './plan-progress';
import type {PlanProgressInput} from './plan-progress-input';

type ProgressOrder = StoreOrder & {requested_delivery_date:string|null; estimated_delivery_date:string|null; plan_started_on:string|null; plan_progress_version:number};
type ReviewRow = {day:PlanReviewDay; comment:string; feedback:string|null; updated_at:string; feedback_at:string|null};
type MutationReceipt = {order_id:string; actor_id:string; payload_hash:string};
type Access = {userId:string; admin:boolean};
const changed = () => new MemberInputError('El seguimiento cambió. Actualiza los datos y vuelve a intentarlo.', 409);

async function progressOrder(db:D1Database, orderId:string, access:Access) {
  const order = await db.prepare('SELECT * FROM orders WHERE id=? AND (?=1 OR user_id=?)').bind(orderId, access.admin ? 1 : 0, access.userId).first<ProgressOrder>();
  if (!order) throw new MemberInputError('Este pedido no está disponible.', 404);
  if (order.status !== 'approved') throw new MemberInputError('El seguimiento está disponible mientras el pago esté aprobado.', 409);
  if (!access.admin && (!order.user_id || !orderHasPlan(order))) throw new MemberInputError('El seguimiento requiere un plan pagado vinculado a tu cuenta.', 403);
  return order;
}

export async function readPlanProgress(db:D1Database, orderId:string, access:Access):Promise<PlanProgressSnapshot> {
  // A read batch keeps dates and private records in one consistent snapshot.
  // Each child read independently enforces payment and current ownership.
  const guard = "o.id=? AND o.status='approved' AND (?=1 OR o.user_id=?)";
  const params = [orderId, access.admin ? 1 : 0, access.userId];
  const rows = await db.batch([
    db.prepare(`SELECT o.* FROM orders AS o WHERE ${guard}`).bind(...params),
    db.prepare(`SELECT s.session_on FROM plan_progress_sessions AS s JOIN orders AS o ON o.id=s.order_id WHERE ${guard} AND s.completed=1 ORDER BY s.session_on LIMIT 90`).bind(...params),
    db.prepare(`SELECT r.day,r.comment,r.feedback,r.updated_at,r.feedback_at FROM plan_progress_reviews AS r JOIN orders AS o ON o.id=r.order_id WHERE ${guard} ORDER BY r.day LIMIT 3`).bind(...params),
  ]);
  const order = rows[0].results[0] as ProgressOrder|undefined;
  if (!order) throw new MemberInputError('Este pedido no está disponible o su pago ya no está aprobado.', 404);
  const hasPlan = orderHasPlan(order);
  if (!access.admin && (!hasPlan || !order.user_id)) throw new MemberInputError('El seguimiento requiere un plan pagado vinculado a tu cuenta.', 403);
  return {
    order:{id:order.id, hasPlan, requestedDeliveryDate:order.requested_delivery_date ?? null, estimatedDeliveryDate:order.estimated_delivery_date ?? null, planStartedOn:order.plan_started_on ?? null, planEndsOn:order.plan_started_on ? addPlanDays(order.plan_started_on, 89) : null, progressVersion:order.plan_progress_version},
    today:mexicoToday(),
    sessions:hasPlan ? (rows[1].results as {session_on:string}[]).map(row => row.session_on) : [],
    reviews:hasPlan ? (rows[2].results as ReviewRow[]).map(row => ({day:row.day, comment:row.comment, feedback:row.feedback, updatedAt:row.updated_at, feedbackAt:row.feedback_at})) : [],
  };
}

async function requestHash(input:PlanProgressInput) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function wasApplied(db:D1Database, input:PlanProgressInput, access:Access, hash:string) {
  const receipt = await db.prepare('SELECT order_id,actor_id,payload_hash FROM plan_progress_mutations WHERE request_id=?').bind(input.requestId).first<MutationReceipt>();
  if (!receipt) return false;
  if (receipt.order_id !== input.orderId || receipt.actor_id !== access.userId || receipt.payload_hash !== hash) throw changed();
  return true;
}

export async function writePlanProgress(db:D1Database, input:PlanProgressInput, access:Access) {
  const order = await progressOrder(db, input.orderId, access);
  const hash = await requestHash(input);
  if (await wasApplied(db, input, access, hash)) return {...await readPlanProgress(db, order.id, access), replayed:true};
  if (order.plan_progress_version !== input.expectedVersion) throw changed();
  const hasPlan = orderHasPlan(order);
  const today = mexicoToday();
  if (input.action !== 'dates' && (!hasPlan || !order.user_id || !order.plan_started_on)) throw new MemberInputError('Carly debe acordar y guardar el inicio del plan antes de registrar avances.', 409);
  if (input.action === 'dates') {
    if (!hasPlan && input.planStartedOn !== null) throw new MemberInputError('Este pedido no incluye un plan de entrenamiento.');
    if (input.planStartedOn !== order.plan_started_on) {
      const recorded = await db.prepare('SELECT 1 AS found FROM plan_progress_sessions WHERE order_id=? UNION ALL SELECT 1 FROM plan_progress_reviews WHERE order_id=? LIMIT 1').bind(order.id, order.id).first();
      if (recorded) throw new MemberInputError('El inicio ya tiene avances registrados y no se puede cambiar. La fecha estimada de entrega sí se puede actualizar.', 409);
    }
  } else if (input.action === 'session') {
    if (input.date < order.plan_started_on! || input.date > addPlanDays(order.plan_started_on!, 89) || input.date > today) throw new MemberInputError('Elige una fecha transcurrida dentro de los 90 días de tu plan.');
  } else {
    if (today < addPlanDays(order.plan_started_on!, input.day - 1)) throw new MemberInputError('Esta revisión estará disponible cuando llegue su fecha.');
    if (input.action === 'feedback') {
      const review = await db.prepare('SELECT day FROM plan_progress_reviews WHERE order_id=? AND day=?').bind(order.id, input.day).first();
      if (!review) throw new MemberInputError('El cliente debe completar esta revisión antes de recibir retroalimentación.', 409);
    }
  }

  const now = new Date().toISOString();
  const attempt = crypto.randomUUID();
  const nextVersion = input.expectedVersion + 1;
  const estimate = input.action === 'dates' ? input.estimatedDeliveryDate : order.estimated_delivery_date;
  const start = input.action === 'dates' ? input.planStartedOn : order.plan_started_on;
  const receiptGuard = 'EXISTS (SELECT 1 FROM plan_progress_mutations WHERE attempt_id=?)';
  const statements = [
    db.prepare("UPDATE orders SET plan_progress_version=plan_progress_version+1,estimated_delivery_date=?,plan_started_on=? WHERE id=? AND plan_progress_version=? AND status='approved' AND user_id IS ? AND items=? AND NOT EXISTS (SELECT 1 FROM plan_progress_mutations WHERE request_id=?) AND (plan_started_on IS ? OR (NOT EXISTS (SELECT 1 FROM plan_progress_sessions WHERE order_id=orders.id) AND NOT EXISTS (SELECT 1 FROM plan_progress_reviews WHERE order_id=orders.id)))")
      .bind(estimate, start, order.id, input.expectedVersion, order.user_id, order.items, input.requestId, start),
    db.prepare('INSERT INTO plan_progress_mutations (request_id,order_id,actor_id,payload_hash,attempt_id,version,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1')
      .bind(input.requestId, order.id, access.userId, hash, attempt, nextVersion, now),
  ];
  if (input.action === 'session') statements.push(db.prepare(`INSERT INTO plan_progress_sessions (order_id,session_on,completed,updated_at) SELECT ?,?,?,? WHERE ${receiptGuard} ON CONFLICT(order_id,session_on) DO UPDATE SET completed=excluded.completed,updated_at=excluded.updated_at`).bind(order.id, input.date, input.completed ? 1 : 0, now, attempt));
  if (input.action === 'review') statements.push(db.prepare(`INSERT INTO plan_progress_reviews (order_id,day,comment,updated_at) SELECT ?,?,?,? WHERE ${receiptGuard} ON CONFLICT(order_id,day) DO UPDATE SET comment=excluded.comment,updated_at=excluded.updated_at,feedback=NULL,feedback_at=NULL`).bind(order.id, input.day, input.comment, now, attempt));
  if (input.action === 'feedback') statements.push(db.prepare(`UPDATE plan_progress_reviews SET feedback=?,feedback_at=? WHERE order_id=? AND day=? AND ${receiptGuard}`).bind(input.feedback, now, order.id, input.day, attempt));
  const details = input.action === 'dates' ? {estimatedDeliveryDate:estimate, planStartedOn:start, version:nextVersion} : input.action === 'session' ? {date:input.date, completed:input.completed, version:nextVersion} : {day:input.day, version:nextVersion};
  statements.push(db.prepare(`INSERT INTO store_audit (id,actor_id,order_id,action,details,created_at) SELECT ?,?,?,?,?,? WHERE ${receiptGuard}`).bind(crypto.randomUUID(), access.userId, order.id, `plan_${input.action}`, JSON.stringify(details), now, attempt));
  // D1 rolls the entire batch back if any record or audit statement fails.
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1) {
    if (await wasApplied(db, input, access, hash)) return {...await readPlanProgress(db, order.id, access), replayed:true};
    throw changed();
  }
  return {...await readPlanProgress(db, order.id, access), replayed:false};
}
