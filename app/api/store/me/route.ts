import {memberSession, memberJson} from '@/lib/supabase-server';
import {MEMBER_ORDER_LIMIT, canManageStore, hasApprovedPlan, intakeForUser, materialsForOrders, presentOrder, refreshMemberDirectory, requireStoreUser, storeDatabase, storeFailure, type StoreOrder} from '@/lib/store-server';
import {storeQuery} from '@/lib/store-input';

export async function GET(request: Request) {
  const session = memberSession(request);
  try {
    const {user} = await requireStoreUser(request, session);
    const db = storeDatabase();
    const {offset} = storeQuery(request.url);
    const allowed = await canManageStore(session!);
    await refreshMemberDirectory(db, user, session!);
    const [orders, intake, approved] = await Promise.all([
      db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').bind(user.id, MEMBER_ORDER_LIMIT + 1, offset).all<StoreOrder>(),
      intakeForUser(db, user.id),
      hasApprovedPlan(db, user.id),
    ]);
    const page = orders.results.slice(0, MEMBER_ORDER_LIMIT);
    const materials = await materialsForOrders(db, page);
    return session!.finish(memberJson({canManageStore: allowed, orders: page.map(order => presentOrder(order, materials)), intake, hasApprovedPlan: approved, hasMore: orders.results.length > MEMBER_ORDER_LIMIT}));
  } catch (error) { return storeFailure(session, error); }
}
