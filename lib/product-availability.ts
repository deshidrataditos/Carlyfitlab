import {catalog, type CartLine} from './catalog';
import {MemberInputError} from './member-input';
import {webhookConfig,sellerEnvironmentMatches,mpRequest,type MPConfig} from './payment';

export const CHECKOUT_RESERVATION_SECONDS = 24 * 60 * 60;
export const CHECKOUT_GLOBAL_DAILY_LIMIT = 500;
export const AVAILABILITY_TIME_ZONE = 'America/Mexico_City';
export type AvailabilityStatus = 'available' | 'made_to_order' | 'sold_out';
type AvailabilityRow = {product_id:string;status:AvailabilityStatus;capacity:number|null;max_per_order:number|null;held:number;committed:number;version:number};
export type PublicAvailability = {id:string;status:AvailabilityStatus;remaining:number|null;maxPerOrder:number|null;leadDays:number;version:number};
export type AdminAvailability = PublicAvailability & {capacity:number|null;reserved:number;committed:number};

export function mexicoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:AVAILABILITY_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return `${parts.find(part=>part.type==='year')!.value}-${parts.find(part=>part.type==='month')!.value}-${parts.find(part=>part.type==='day')!.value}`;
}
export function preparationDays(id:string) {return /^(pastel-zanahoria|cheesecake-carlyfit)(-grande)?$/.test(id) ? 3 : 0;}

/** Combine paid products and included pack pieces; never count a bundle as five arbitrary items. */
export function reservationItems(lines:readonly CartLine[], desserts:readonly CartLine[]): {id:string;quantity:number}[] {
  const counts = new Map<string,number>();
  for (const line of [...lines,...desserts]) {
    if (!catalog.some(item=>item.id===line.id&&item.available!==false) || !Number.isSafeInteger(line.quantity) || line.quantity<1) throw new MemberInputError('Revisa los productos y cantidades del pedido.');
    counts.set(line.id,(counts.get(line.id)??0)+line.quantity);
  }
  return [...counts].map(([id,quantity])=>({id,quantity}));
}

export function requestedDeliveryDate(value:unknown, items:readonly {id:string}[], now=new Date()):string|null {
  if (value===undefined||value===null||value==='') return null;
  if (!items.some(line=>catalog.some(item=>item.id===line.id&&item.kind==='product'))) throw new MemberInputError('La fecha solicitada se utiliza únicamente para productos físicos.');
  if (typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MemberInputError('Escribe una fecha válida para solicitar la entrega.');
  const timestamp=Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==value) throw new MemberInputError('La fecha solicitada no existe.');
  const today=Date.parse(`${mexicoToday(now)}T00:00:00Z`);
  const days=Math.max(0,...items.map(item=>preparationDays(item.id)));
  if (timestamp<today+days*86400000||timestamp>today+365*86400000) throw new MemberInputError(days ? 'Los pasteles requieren al menos 3 días de anticipación. Elige una fecha dentro del próximo año; Carly confirmará la entrega.' : 'Elige una fecha desde hoy y dentro del próximo año. Carly confirmará la entrega.');
  return value;
}

export async function expireProductReservations(db:D1Database) {
  // Bounded housekeeping. Expired/ambiguous checkouts still hold capacity: a
  // preference's expiry does not prove that every pending payment is cancelled.
  await db.prepare("UPDATE product_reservations SET state='expired' WHERE order_id IN (SELECT order_id FROM product_reservations WHERE state='held' AND expires_at<=unixepoch() ORDER BY expires_at LIMIT 50)").run();
}

export async function readProductAvailability(db:D1Database, admin=false):Promise<(PublicAvailability|AdminAvailability)[]> {
  const rows=await db.prepare('SELECT product_id,status,capacity,max_per_order,held,committed,version FROM product_availability').all<AvailabilityRow>();
  const byId=new Map(rows.results.map(row=>[row.product_id,row]));
  return catalog.map(item=>{
    const row=byId.get(item.id);
    if (!row) throw new Error('Availability configuration missing');
    const remaining=row.capacity===null?null:Math.max(0,row.capacity-row.held-row.committed);
    const common:PublicAvailability={id:item.id,status:item.available===false?'sold_out':!admin&&remaining===0?'sold_out':row.status,remaining,maxPerOrder:row.max_per_order,leadDays:preparationDays(item.id),version:row.version};
    return admin?{...common,capacity:row.capacity,reserved:row.held,committed:row.committed}:common;
  });
}

export async function reserveProductAvailability(db:D1Database,orderId:string,items:readonly {id:string;quantity:number}[],now=Date.now()):Promise<string> {
  const created=Math.floor(now/1000), expires=created+CHECKOUT_RESERVATION_SECONDS;
  await expireProductReservations(db);
  try {
    await db.batch([
      db.prepare("INSERT INTO product_reservations(order_id,state,created_at,expires_at) VALUES (?,'held',?,?)").bind(orderId,created,expires),
      ...items.map(item=>db.prepare('INSERT INTO product_reservation_items(order_id,product_id,quantity) VALUES (?,?,?)').bind(orderId,item.id,item.quantity)),
    ]);
  } catch {
    throw new MemberInputError('La disponibilidad cambió o la cantidad supera el límite. Actualiza tu carrito antes de pagar.',409);
  }
  return new Date(expires*1000).toISOString();
}

/** Stored authoritative payment state wins, including duplicate/out-of-order notifications. */
export async function reconcileProductReservation(db:D1Database,orderId:string) {
  await db.prepare("UPDATE product_reservations SET state=CASE WHEN state='released' THEN 'conflict' ELSE 'committed' END WHERE order_id=? AND state IN ('held','expired','released') AND EXISTS (SELECT 1 FROM orders WHERE id=product_reservations.order_id AND status='approved')").bind(orderId).run();
}

/** Only call for a definitive preference rejection, never a timeout or uncertain response. */
export async function releaseRejectedPreference(db:D1Database,orderId:string) {
  await db.prepare("UPDATE product_reservations SET state='released' WHERE order_id=? AND state IN ('held','expired') AND EXISTS (SELECT 1 FROM orders WHERE id=product_reservations.order_id AND payment_id IS NULL AND preference_id IS NULL AND status='pending')").bind(orderId).run();
}

export async function limitCheckoutAttempts(db:D1Database,request:Request,userId:string|null) {
  const ip=request.headers.get('cf-connecting-ip');
  if(!ip&&!userId)throw new MemberInputError('No pudimos verificar el acceso al pago. Actualiza la página o inicia sesión.',503);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`checkout:${ip||userId}`));
  const identity=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const now=Math.floor(Date.now()/1000);
  const rules=[{identity,window:900,limit:5},{identity,window:86400,limit:20},{identity:'global',window:900,limit:60},{identity:'global',window:86400,limit:CHECKOUT_GLOBAL_DAILY_LIMIT}]
    .map(rule=>({...rule,bucket:`${rule.identity}:${rule.window}:${now-now%rule.window}`,expiry:now-now%rule.window+rule.window}));
  const blockers=rules.map(()=>'(bucket=? AND attempts>=?)').join(' OR ');
  const results=await db.batch(rules.map((rule,index)=>{
    // A failed gate does not consume another quota: rejected requests cannot
    // exhaust the global allowance. D1 executes this entire chain atomically.
    const guard=index===0?`NOT EXISTS (SELECT 1 FROM checkout_attempts WHERE ${blockers})`:'changes()=1';
    return db.prepare(`INSERT INTO checkout_attempts(bucket,attempts,expires_at) SELECT ?,1,? WHERE ${guard} ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1`)
      .bind(rule.bucket,rule.expiry,...(index===0?rules.flatMap(item=>[item.bucket,item.limit]):[]));
  }));
  if(results.some(result=>result.meta.changes!==1))throw new MemberInputError('Ya hay varios intentos de pago recientes. Inténtalo más tarde o consulta a Carly; evita pagar el mismo pedido dos veces.',429);
}

export async function allocateLateProductReservation(db:D1Database,orderId:string,actorId:string) {
  try {
    const result=await db.batch([
      db.prepare("UPDATE product_reservations SET state='committed' WHERE order_id=? AND state='conflict' AND EXISTS (SELECT 1 FROM orders WHERE id=product_reservations.order_id AND status='approved')").bind(orderId),
      db.prepare("INSERT INTO store_audit(id,actor_id,order_id,action,details,created_at) SELECT ?,?,?,'late_payment_capacity','{}',? WHERE changes()=1").bind(crypto.randomUUID(),actorId,orderId,new Date().toISOString()),
    ]);
    if(result[0].meta.changes!==1)throw new MemberInputError('La reserva o el pago cambió. Actualiza antes de asignar disponibilidad.',409);
  }catch(error){
    if(error instanceof MemberInputError)throw error;
    throw new MemberInputError('No hay capacidad para todo el pedido o no se pudo registrar la asignación. Revisa los productos antes de intentar de nuevo.',409);
  }
}

type ReviewReservation={order_id:string;state:string;expires_at:number;preference_id:string|null;status:string};
export async function listProductReservations(db:D1Database) {
  return (await db.prepare("SELECT r.order_id,r.state,r.expires_at,o.preference_id,o.status FROM product_reservations r JOIN orders o ON o.id=r.order_id WHERE r.state IN ('held','expired','conflict') ORDER BY r.created_at LIMIT 50").all<ReviewReservation>()).results;
}

async function reviewReservation(db:D1Database,config:MPConfig,row:ReviewReservation):Promise<void> {
  // A day of buffer follows preference expiry. Never release merely on a local timer.
  if(row.state==='conflict'||!row.preference_id||row.expires_at>Math.floor(Date.now()/1000)-86400)return;
  await reconcileProductReservation(db,row.order_id);
  if(row.status==='approved')return;
  const preference=await mpRequest<{id:unknown;collector_id:unknown;external_reference:unknown;expires:unknown;expiration_date_to:unknown}>(config,`/checkout/preferences/${encodeURIComponent(row.preference_id)}`);
  const expiry=typeof preference.expiration_date_to==='string'?Date.parse(preference.expiration_date_to):NaN;
  if(String(preference.id)!==row.preference_id||String(preference.collector_id)!==config.collectorId||preference.external_reference!==row.order_id||preference.expires!==true||!Number.isFinite(expiry)||expiry>Date.now()-86400000)return;
  const payments=await mpRequest<{paging?:{total?:unknown};results?:{external_reference:unknown;collector_id:unknown;status:unknown}[]}>(config,`/v1/payments/search?external_reference=${encodeURIComponent(row.order_id)}&limit=100&offset=0`);
  if(!Array.isArray(payments.results)||typeof payments.paging?.total!=='number'||payments.paging.total!==payments.results.length||payments.results.some(payment=>payment.external_reference!==row.order_id||String(payment.collector_id)!==config.collectorId||!['rejected','cancelled'].includes(String(payment.status))))return;
  // An approval arriving concurrently wins this condition. If an exceptional late
  // approval arrives AFTER release, reconciliation flags a fulfillment conflict.
  await db.prepare("UPDATE product_reservations SET state='released' WHERE order_id=? AND state IN ('held','expired') AND EXISTS (SELECT 1 FROM orders WHERE id=product_reservations.order_id AND preference_id=? AND status IN ('pending','rejected','cancelled'))").bind(row.order_id,row.preference_id).run();
}

export async function reviewProductReservation(db:D1Database,orderId:string) {
  const config=webhookConfig();
  if(!config||!await sellerEnvironmentMatches(config))throw new MemberInputError('No pudimos verificar la cuenta de pagos para revisar la reserva.',503);
  const row=await db.prepare('SELECT r.order_id,r.state,r.expires_at,o.preference_id,o.status FROM product_reservations r JOIN orders o ON o.id=r.order_id WHERE r.order_id=?').bind(orderId).first<ReviewReservation>();
  if(!row)throw new MemberInputError('No encontramos esa reserva.',404);
  await reviewReservation(db,config,row);
}

/** Integrate into the existing scheduled Worker. At most five provider reviews per run. */
export async function processProductReservations(bindings:{DB?:D1Database}) {
  const db=bindings.DB;if(!db)return;
  await expireProductReservations(db);
  await db.prepare('DELETE FROM checkout_attempts WHERE bucket IN (SELECT bucket FROM checkout_attempts WHERE expires_at<unixepoch() LIMIT 100)').run();
  const rows=await db.prepare("SELECT r.order_id,r.state,r.expires_at,o.preference_id,o.status FROM product_reservations r JOIN orders o ON o.id=r.order_id WHERE r.state IN ('held','expired') AND r.expires_at<unixepoch()-86400 AND r.next_check_at<=unixepoch() AND o.preference_id IS NOT NULL ORDER BY r.next_check_at,r.expires_at LIMIT 5").all<ReviewReservation>();
  if(!rows.results.length)return;
  const config=webhookConfig();if(!config||!await sellerEnvironmentMatches(config))return;
  for(const row of rows.results){
    await db.prepare('UPDATE product_reservations SET next_check_at=unixepoch()+3600 WHERE order_id=?').bind(row.order_id).run();
    await reviewReservation(db,config,row).catch(()=>{});
  }
}

export function availabilityInput(body:Record<string,unknown>) {
  if (Object.keys(body).some(key=>!['productId','status','capacity','maxPerOrder','expectedVersion'].includes(key))) throw new MemberInputError('Revisa los campos de disponibilidad.');
  const product=catalog.find(item=>item.id===body.productId&&item.available!==false);
  if (!product||!['available','made_to_order','sold_out'].includes(String(body.status))) throw new MemberInputError('Selecciona un producto y estado válidos.');
  const nullable=(value:unknown,min:number,max:number)=>{
    if(value===null)return null;
    if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new MemberInputError('Revisa los límites de cantidad. Usa un campo vacío para no fijar un límite.');
    return value;
  };
  if (typeof body.expectedVersion!=='number'||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||body.expectedVersion>2147483646) throw new MemberInputError('Actualiza la disponibilidad antes de guardar.');
  return {productId:product.id,status:body.status as AvailabilityStatus,capacity:nullable(body.capacity,0,1000000),maxPerOrder:nullable(body.maxPerOrder,1,1000),expectedVersion:body.expectedVersion};
}

export async function updateProductAvailability(db:D1Database,body:Record<string,unknown>,actorId:string) {
  const input=availabilityInput(body),now=new Date().toISOString();
  const result=await db.batch([
    db.prepare('UPDATE product_availability SET status=?,capacity=?,max_per_order=?,version=version+1,updated_at=?,updated_by=? WHERE product_id=? AND version=? AND (? IS NULL OR ?>=held+committed)')
      .bind(input.status,input.capacity,input.maxPerOrder,now,actorId,input.productId,input.expectedVersion,input.capacity,input.capacity),
    db.prepare("INSERT INTO store_audit(id,actor_id,order_id,action,details,created_at) SELECT ?,?,NULL,'product_availability',?,? WHERE changes()=1")
      .bind(crypto.randomUUID(),actorId,JSON.stringify(input),now),
  ]);
  if(result[0].meta.changes!==1)throw new MemberInputError('La disponibilidad cambió o la capacidad es menor que las unidades ya reservadas y vendidas. Actualiza antes de guardar.',409);
}
