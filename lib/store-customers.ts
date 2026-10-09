import {MemberInputError} from './member-input';
import type {StoreSession} from './store-server';

export const CUSTOMER_PAGE_SIZE = 20;
export const CUSTOMER_MAX_OFFSET = 100000;
export type StoreCustomer = {
  id:string; displayName:string; email:string|null; registeredAt:string;
  orderCount:number; approvedOrderCount:number; approvedAmountCents:number; lastOrderAt:string|null;
};
type DirectoryRow = {id:string;display_name:string;email:string|null;created_at:string};
type CustomerStats = {user_id:string;order_count:number;approved_order_count:number;approved_amount_cents:number;last_order_at:string|null};

export function customerDirectoryQuery(url:string) {
  const params = new URL(url).searchParams;
  const rawSearch = params.get('q') ?? '';
  const offsetText = params.get('offset') ?? '0';
  if (rawSearch.length > 100 || /[\x00-\x1f\x7f]/.test(rawSearch)
    || !/^(0|[1-9]\d{0,5})$/.test(offsetText) || Number(offsetText) > CUSTOMER_MAX_OFFSET) {
    throw new MemberInputError('Revisa la búsqueda o la página de clientes.');
  }
  return {search:rawSearch.trim(),offset:Number(offsetText)};
}

function directoryRows(value:unknown):DirectoryRow[] {
  if (!Array.isArray(value) || value.length > CUSTOMER_PAGE_SIZE + 1) throw new Error('Invalid customer directory');
  const seen = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
      || seen.has(row.id) || typeof row.display_name !== 'string' || [...row.display_name].length > 80
      || (row.email !== null && (typeof row.email !== 'string' || row.email.length > 320))
      || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) {
      throw new Error('Invalid customer directory');
    }
    seen.add(row.id);
    // The RPC can only project these four fields; never spread auth records.
    return {id:row.id,display_name:row.display_name,email:row.email,created_at:row.created_at};
  });
}

export async function listStoreCustomers(db:D1Database, session:StoreSession, url:string) {
  const query = customerDirectoryQuery(url);
  // Uses the administrator's verified session. The RPC repeats the role check;
  // no auth-admin/service-role credential is required or exposed.
  const result = await session.client.rpc('list_store_customers', {
    p_search:query.search,p_limit:CUSTOMER_PAGE_SIZE + 1,p_offset:query.offset,
  });
  if (result.error?.code === '42501') throw new MemberInputError('Tu cuenta no tiene permiso para administrar la tienda.',403);
  if (result.error) throw result.error;
  const rows = directoryRows(result.data);
  const page = rows.slice(0,CUSTOMER_PAGE_SIZE);
  if (!page.length) return {customers:[] as StoreCustomer[],hasMore:false};
  // Only exact authenticated user IDs link purchases. Matching an email could
  // incorrectly attribute a guest purchase or another account's private order.
  const stats = await db.prepare(`SELECT user_id,COUNT(*) order_count,
    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved_order_count,
    COALESCE(SUM(CASE WHEN status='approved' THEN amount_cents ELSE 0 END),0) approved_amount_cents,
    MAX(created_at) last_order_at FROM orders
    WHERE user_id IN (${page.map(() => '?').join(',')}) GROUP BY user_id`)
    .bind(...page.map(row => row.id)).all<CustomerStats>();
  const byUser = new Map(stats.results.map(row => [row.user_id,row]));
  const customers:StoreCustomer[] = page.map(row => {
    const orders = byUser.get(row.id);
    return {id:row.id,displayName:row.display_name,email:row.email,registeredAt:row.created_at,
      orderCount:orders?.order_count ?? 0,approvedOrderCount:orders?.approved_order_count ?? 0,
      approvedAmountCents:orders?.approved_amount_cents ?? 0,lastOrderAt:orders?.last_order_at ?? null};
  });
  return {customers,hasMore:rows.length > CUSTOMER_PAGE_SIZE};
}
