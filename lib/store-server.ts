import {env} from 'cloudflare:workers';
import {memberSession, memberFailure} from './supabase-server';
import {MemberInputError} from './member-input';
import {PLAN_IDS, type StoreIntake} from './store-input';

export type StoreSession = NonNullable<ReturnType<typeof memberSession>>;
export const PLAN_BUCKET = 'carlyfit-plans';
export const MEMBER_ORDER_LIMIT = 50;
export const ADMIN_ORDER_LIMIT = 20;
export const MATERIALS_PER_ORDER = 20;
export type StoreOrder = {id: string; user_id: string | null; items: string; status: string; amount_cents: number; currency: string; delivery: string; customer_name: string; created_at: string; fulfillment_status: string; fulfillment_note: string; version: number; dessert_selection: string | null; intake_received_at: string | null; plan_contact_email?: string | null; email?: string | null; requested_delivery_date?:string|null; estimated_delivery_date?:string|null; plan_started_on?:string|null; plan_progress_version?:number; availability_status?:string};
export type StoreMaterial = {id: string; order_id: string; user_id: string; title: string; kind: 'routine' | 'nutrition' | 'video'; object_path: string; content_type: string; byte_size: number; state: string; created_by: string; created_at: string; expires_at: string};

export function storeDatabase() {
  if (!env.DB) throw new MemberInputError('Estamos preparando el acceso a tus pedidos. Inténtalo de nuevo en un momento.', 503);
  return env.DB;
}

export async function requireStoreUser(request: Request, suppliedSession?: StoreSession | null) {
  const session = suppliedSession === undefined ? memberSession(request) : suppliedSession;
  if (!session) throw new MemberInputError('El acceso a tu cuenta aún no está disponible.', 503);
  const {data: {user}, error} = await session.client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401 && error.status !== 403) throw error;
  if (!user || error) throw new MemberInputError('Inicia sesión para consultar tu cuenta.', 401);
  if (user.is_anonymous) throw new MemberInputError('Usa tu cuenta de Google para acceder a tus pedidos.', 403);
  return {session, user};
}

export async function canManageStore(session: StoreSession) {
  const permission = await session.client.rpc('can_manage_store');
  if (permission.error) throw permission.error;
  return permission.data === true;
}

export async function requireStoreAdmin(session: StoreSession) {
  if (!await canManageStore(session)) throw new MemberInputError('Tu cuenta no tiene permiso para administrar la tienda.', 403);
}

export function storeFailure(session: StoreSession | null, error: unknown) {
  const response = memberFailure(error);
  return session?.finish(response) ?? response;
}

export async function refreshMemberDirectory(db: D1Database, user: {id: string; email?: string}, session: StoreSession) {
  const profile = await session.client.from('profiles').select('display_name').eq('id', user.id).single();
  if (profile.error) throw profile.error;
  const name = typeof profile.data?.display_name === 'string' ? profile.data.display_name.slice(0, 80) : '';
  await db.prepare('INSERT INTO member_directory (user_id,email,display_name,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at')
    .bind(user.id, user.email ?? null, name, new Date().toISOString()).run();
}

export function orderHasPlan(order: {items: string}) {
  return orderItems(order).some(item => PLAN_IDS.includes(String(item.id)));
}

export function orderItems(order: {items: string}): Record<string, unknown>[] {
  const value: unknown = JSON.parse(order.items);
  if (!Array.isArray(value) || value.length > 50 || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Invalid stored items');
  return value;
}

export async function hasApprovedPlan(db: D1Database, userId: string) {
  const placeholders = PLAN_IDS.map(() => '?').join(',');
  const row = await db.prepare(`SELECT id FROM orders WHERE user_id=? AND status='approved' AND EXISTS (SELECT 1 FROM json_each(orders.items) AS item WHERE json_extract(item.value,'$.id') IN (${placeholders})) LIMIT 1`).bind(userId, ...PLAN_IDS).first();
  return Boolean(row);
}

export async function requireApprovedPlan(db: D1Database, userId: string) {
  if (!await hasApprovedPlan(db, userId)) throw new MemberInputError('Tu formulario estará disponible cuando el pago de tu plan esté aprobado.', 403);
}

export async function intakeForUser(db: D1Database, userId: string): Promise<StoreIntake | null> {
  return db.prepare('SELECT goal,experience,place,days,minutes,equipment FROM store_intake WHERE user_id=?').bind(userId).first<StoreIntake>();
}

export async function materialsForOrders(db: D1Database, orders: StoreOrder[]) {
  const approved = orders.filter(order => order.status === 'approved' && order.user_id);
  if (!approved.length) return [];
  const rows = await db.prepare(`SELECT id,order_id,title,kind FROM store_materials WHERE state='published' AND order_id IN (${approved.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT ?`).bind(...approved.map(order => order.id), approved.length * MATERIALS_PER_ORDER).all<Pick<StoreMaterial, 'id' | 'order_id' | 'title' | 'kind'>>();
  return rows.results;
}

export function presentOrder(order: StoreOrder, materials: Awaited<ReturnType<typeof materialsForOrders>>) {
  const assigned = materials.filter(material => material.order_id === order.id).map(({id, title, kind}) => ({id, title, kind}));
  return {id: order.id, items: orderItems(order), status: order.status, amount_cents: order.amount_cents, currency: order.currency, delivery: order.delivery, created_at: order.created_at, fulfillment_status: order.fulfillment_status, fulfillment_note: order.fulfillment_note, version: order.version, dessert_selection: order.dessert_selection ? JSON.parse(order.dessert_selection) : null, hasPlan: orderHasPlan(order), intakeReceivedAt: order.intake_received_at ?? null, availabilityStatus:order.availability_status ?? 'legacy', requestedDeliveryDate:order.requested_delivery_date ?? null, estimatedDeliveryDate:order.estimated_delivery_date ?? null, planStartedOn:order.plan_started_on ?? null, planReady: assigned.length > 0, materials: assigned};
}

export async function approvedMaterialOrder(db: D1Database, orderId: string) {
  const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first<StoreOrder>();
  if (!order) throw new MemberInputError('Este pedido ya no está disponible.', 404);
  if (!order.user_id || order.status !== 'approved' || !orderHasPlan(order)) throw new MemberInputError('Solo puedes asignar materiales a un plan pagado y vinculado con una cuenta.', 409);
  return order as StoreOrder & {user_id: string};
}

// Larger than the general member body cap, still bounded before JSON parsing.
export async function storeContentBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new MemberInputError('El formato de la solicitud no es válido.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new MemberInputError('Faltan los datos de la solicitud.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 768000) { await reader.cancel(); throw new MemberInputError('El contenido es demasiado largo.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new MemberInputError('No pudimos leer los datos.'); }
}
