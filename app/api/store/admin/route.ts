import {MemberInputError, checkMemberOrigin, memberBody} from '@/lib/member-input';
import {memberSession, memberJson} from '@/lib/supabase-server';
import {checkFulfillmentTransition, fulfillmentInput, storeQuery, type StoreIntake} from '@/lib/store-input';
import {ADMIN_ORDER_LIMIT, materialsForOrders, presentOrder, requireStoreAdmin, requireStoreUser, storeDatabase, storeFailure, type StoreOrder} from '@/lib/store-server';

export async function GET(request: Request) {
  const session = memberSession(request);
  try {
    await requireStoreUser(request, session);
    await requireStoreAdmin(session!);
    const db = storeDatabase();
    const {status, offset} = storeQuery(request.url);
    const orders = await db.prepare('SELECT o.*,m.email FROM orders AS o LEFT JOIN member_directory AS m ON m.user_id=o.user_id WHERE (?=\'\' OR o.status=?) ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?')
      .bind(status, status, ADMIN_ORDER_LIMIT + 1, offset).all<StoreOrder>();
    const page = orders.results.slice(0, ADMIN_ORDER_LIMIT);
    const ids = [...new Set(page.map(order => order.user_id).filter((id): id is string => Boolean(id)))];
    const [materials, intakeRows] = await Promise.all([
      materialsForOrders(db, page),
      ids.length ? db.prepare(`SELECT user_id,goal,experience,place,days,minutes,equipment FROM store_intake WHERE user_id IN (${ids.map(() => '?').join(',')}) LIMIT ?`).bind(...ids, ADMIN_ORDER_LIMIT).all<StoreIntake & {user_id: string}>() : Promise.resolve({results: [] as (StoreIntake & {user_id: string})[]}),
    ]);
    return session!.finish(memberJson({orders: page.map(order => ({...presentOrder(order, materials), user_id: order.user_id, email: order.email ?? null, customer_name: order.customer_name, intake: intakeRows.results.find(intake => intake.user_id === order.user_id) ?? null})), hasMore: orders.results.length > ADMIN_ORDER_LIMIT}));
  } catch (error) { return storeFailure(session, error); }
}

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    const {user} = await requireStoreUser(request, session);
    await requireStoreAdmin(session!);
    const input = fulfillmentInput(await memberBody(request));
    const db = storeDatabase();
    const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(input.orderId).first<StoreOrder>();
    if (!order) throw new MemberInputError('Este pedido ya no está disponible.', 404);
    if (order.version !== input.expectedVersion) throw new MemberInputError('El pedido cambió. Actualiza la lista antes de continuar.', 409);
    checkFulfillmentTransition(order.status, order.fulfillment_status, input.fulfillmentStatus, order.delivery);
    const now = new Date().toISOString();
    // D1 batches are transactional. changes() makes the audit insert contingent
    // on the preceding conditional update, including concurrent payment changes.
    const result = await db.batch([
      db.prepare('UPDATE orders SET fulfillment_status=?,fulfillment_note=?,version=version+1 WHERE id=? AND version=? AND status=?')
        .bind(input.fulfillmentStatus, input.fulfillmentNote, order.id, input.expectedVersion, order.status),
      db.prepare('INSERT INTO store_audit (id,actor_id,order_id,action,details,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1')
        .bind(crypto.randomUUID(), user.id, order.id, 'fulfillment', JSON.stringify({from: order.fulfillment_status, to: input.fulfillmentStatus, version: input.expectedVersion + 1}), now),
    ]);
    if (result[0].meta.changes !== 1) throw new MemberInputError('El pedido o su pago cambió. Actualiza la lista antes de continuar.', 409);
    return session!.finish(memberJson({order: {id: order.id, fulfillment_status: input.fulfillmentStatus, fulfillment_note: input.fulfillmentNote, version: input.expectedVersion + 1}}));
  } catch (error) { return storeFailure(session, error); }
}
