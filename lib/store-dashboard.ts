import {MemberInputError} from './member-input';
import {PLAN_IDS} from './store-input';
import {catalog} from './catalog';

export const DASHBOARD_FILTERS = ['all','intake_pending','materials_pending','delivery_pending','overdue'] as const;
export type DashboardFilter = typeof DASHBOARD_FILTERS[number];
export function mexicoToday(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(type => p.find(part => part.type === type)!.value).join('-');
}
function day(value:string) {return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;}
// Old or malformed item JSON must not break the administrator's whole summary.
const storedItems = `CASE WHEN json_valid(o.items) THEN CASE WHEN json_type(o.items)='array' THEN o.items ELSE '[]' END ELSE '[]' END`;
const storedItem = `CASE WHEN i.type='object' THEN i.value ELSE '{}' END`;
const hasPlan = `EXISTS (SELECT 1 FROM json_each(${storedItems}) i WHERE json_extract(${storedItem},'$.id') IN (${PLAN_IDS.map(id => `'${id}'`).join(',')}) AND json_type(${storedItem},'$.quantity')='integer' AND json_extract(${storedItem},'$.quantity')>0)`;
const hasMaterials = `EXISTS (SELECT 1 FROM store_materials sm WHERE sm.order_id=o.id AND sm.user_id=o.user_id AND sm.state='published')`;
const pendingDelivery = `o.delivery<>'digital' AND o.fulfillment_status<>'delivered'`;
export function pendingConditions() {
  return {
    all:'1=1',
    intake_pending:`o.status='approved' AND o.user_id IS NOT NULL AND ${hasPlan} AND o.intake_received_at IS NULL`,
    materials_pending:`o.status='approved' AND o.user_id IS NOT NULL AND ${hasPlan} AND NOT ${hasMaterials}`,
    delivery_pending:`o.status='approved' AND (${pendingDelivery})`,
    overdue:`o.status='approved' AND o.estimated_delivery_date IS NOT NULL AND o.estimated_delivery_date < ? AND ((${pendingDelivery}) OR (${hasPlan} AND NOT ${hasMaterials}))`,
  };
}
export function dashboardOrderQuery(url:string, now = new Date()) {
  const params = new URL(url).searchParams;
  const filter = params.get('filter') || 'all'; const q = (params.get('q') || '').trim();
  if (!DASHBOARD_FILTERS.includes(filter as DashboardFilter) || q.length > 100 || /[\x00-\x1f\x7f]/.test(q)) throw new MemberInputError('Revisa la búsqueda o el filtro.');
  const values:string[] = filter === 'overdue' ? [mexicoToday(now)] : [];
  let sql = pendingConditions()[filter as DashboardFilter];
  if (q) {
    sql += ` AND (o.id LIKE ? ESCAPE '\\' OR o.customer_name LIKE ? ESCAPE '\\' OR m.email LIKE ? ESCAPE '\\' OR o.plan_contact_email LIKE ? ESCAPE '\\')`;
    const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`; values.push(term,term,term,term);
  }
  return {sql,values,filter:filter as DashboardFilter,q};
}
export function dashboardRange(url:string, now = new Date()) {
  const params = new URL(url).searchParams; const to = params.get('to') || mexicoToday(now);
  const fallback = new Date(`${to}T12:00:00Z`); fallback.setUTCDate(fallback.getUTCDate()-29);
  const from = params.get('from') || (Number.isFinite(fallback.getTime()) ? fallback.toISOString().slice(0,10) : '');
  if (!day(from) || !day(to) || from>to || (Date.parse(to)-Date.parse(from))/86400000>365) throw new MemberInputError('Elige un periodo válido de hasta un año.');
  // These order records start in 2026; Mexico City uses UTC-06 for this period.
  if (from<'2023-01-01' || to>mexicoToday(now)) throw new MemberInputError('El periodo debe terminar hoy o antes y comenzar a partir de 2023.');
  const end = new Date(`${to}T00:00:00-06:00`); end.setUTCDate(end.getUTCDate()+1);
  return {from,to,start:new Date(`${from}T00:00:00-06:00`).toISOString(),end:end.toISOString()};
}
export async function dashboardSummary(db:D1Database, url:string, now = new Date()) {
  const range = dashboardRange(url,now); const conditions = pendingConditions();
  const [pending,totals,statuses,items] = await Promise.all([
    db.prepare(`SELECT COUNT(CASE WHEN ${conditions.intake_pending} THEN 1 END) intakePending, COUNT(CASE WHEN ${conditions.materials_pending} THEN 1 END) materialsPending, COUNT(CASE WHEN ${conditions.delivery_pending} THEN 1 END) deliveryPending, COUNT(CASE WHEN ${conditions.overdue} THEN 1 END) overdue FROM orders o`).bind(mexicoToday(now)).first(),
    db.prepare(`SELECT COUNT(*) approvedOrders,COALESCE(SUM(amount_cents),0) approvedAmountCents FROM orders WHERE status='approved' AND created_at>=? AND created_at<?`).bind(range.start,range.end).first(),
    db.prepare(`SELECT status,COUNT(*) count FROM orders WHERE created_at>=? AND created_at<? GROUP BY status`).bind(range.start,range.end).all(),
    db.prepare(`SELECT json_extract(${storedItem},'$.id') id,SUM(json_extract(${storedItem},'$.quantity')) quantity,CAST(ROUND(SUM(json_extract(${storedItem},'$.quantity') * json_extract(${storedItem},'$.unit_price') * 100)) AS INTEGER) amountCents FROM orders o,json_each(${storedItems}) i WHERE o.status='approved' AND o.created_at>=? AND o.created_at<? AND json_type(${storedItem},'$.id')='text' AND json_type(${storedItem},'$.quantity')='integer' AND json_extract(${storedItem},'$.quantity')>0 AND json_type(${storedItem},'$.unit_price') IN ('integer','real') AND json_extract(${storedItem},'$.unit_price')>=0 GROUP BY json_extract(${storedItem},'$.id') ORDER BY quantity DESC,id ASC LIMIT 100`).bind(range.start,range.end).all<{id:string;quantity:number;amountCents:number}>(),
  ]);
  const ranked = items.results.map(row => {const item=catalog.find(p=>p.id===row.id);return {...row,name:item?.name || 'Artículo anterior',presentation:item?.presentation || '',kind:item?.kind || 'product'};});
  return {period:{from:range.from,to:range.to},timeZone:'America/Mexico_City',pending,totals,statuses:statuses.results,products:ranked.filter(p=>p.kind==='product').slice(0,10),plans:ranked.filter(p=>p.kind==='plan'),generatedAt:now.toISOString()};
}
