import {MemberInputError, checkMemberOrigin, memberBody} from '@/lib/member-input';
import {memberSession, memberJson} from '@/lib/supabase-server';
import {storeId} from '@/lib/store-input';
import {orderHasPlan, requireStoreAdmin, requireStoreUser, storeDatabase, storeFailure, type StoreOrder} from '@/lib/store-server';

function receiptInput(data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !['orderId', 'expectedVersion', 'status'].includes(key))
    || (data.status !== 'received' && data.status !== 'pending')
    || typeof data.expectedVersion !== 'number' || !Number.isInteger(data.expectedVersion)
    || data.expectedVersion < 0 || data.expectedVersion > 2147483646) {
    throw new MemberInputError('Revisa el pedido y el estado de recepción de la ficha.');
  }
  return {orderId: storeId(data.orderId), expectedVersion: data.expectedVersion, status: data.status};
}

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    const {user} = await requireStoreUser(request, session);
    await requireStoreAdmin(session!);
    const input = receiptInput(await memberBody(request));
    const db = storeDatabase();
    const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(input.orderId).first<StoreOrder>();
    if (!order) throw new MemberInputError('Este pedido ya no está disponible.', 404);
    if (!order.user_id || order.status !== 'approved' || !orderHasPlan(order)) throw new MemberInputError('Solo puedes confirmar la ficha de un plan pagado y vinculado con una cuenta.', 409);
    if (order.version !== input.expectedVersion) throw new MemberInputError('El pedido cambió. Actualiza la lista antes de continuar.', 409);
    const now = new Date().toISOString();
    const receivedAt = input.status === 'received' ? now : null;
    // The receipt and its audit entry are one transaction. Recheck payment,
    // owner and purchased items if any changed after the initial read.
    const result = await db.batch([
      db.prepare("UPDATE orders SET intake_received_at=?,intake_received_by=?,version=version+1 WHERE id=? AND version=? AND status='approved' AND user_id=? AND items=?")
        .bind(receivedAt, receivedAt ? user.id : null, order.id, input.expectedVersion, order.user_id, order.items),
      db.prepare('INSERT INTO store_audit (id,actor_id,order_id,action,details,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1')
        .bind(crypto.randomUUID(), user.id, order.id, 'plan_intake_receipt', JSON.stringify({from: order.intake_received_at ? 'received' : 'pending', to: input.status, version: input.expectedVersion + 1}), now),
    ]);
    if (result[0].meta.changes !== 1) throw new MemberInputError('El pedido o su pago cambió. Actualiza la lista antes de continuar.', 409);
    return session!.finish(memberJson({order: {id: order.id, intakeReceivedAt: receivedAt, version: input.expectedVersion + 1}}));
  } catch (error) { return storeFailure(session, error); }
}
