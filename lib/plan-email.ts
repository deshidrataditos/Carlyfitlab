import {buildPlanEmail} from './plan-email-template';
import {CANONICAL_PLAN_IDS, hasCanonicalPlan} from './plan-onboarding';

export type PlanEmailBindings = {
  DB?: D1Database;
  PLAN_EMAIL_ENABLED?: string;
  PLAN_EMAIL_START_AT?: string;
  RESEND_API_KEY?: string;
};
type Order = {id: string; items: string; user_id: string | null; plan_contact_email: string | null; created_at: string};
type PendingEmail = {order_id: string; payload: string; attempts: number; first_attempt_at: number};

export const PLAN_EMAIL_FROM = 'Carlyfit Lab <hola@correo.carlyfitlab.com>';
export const PLAN_EMAIL_REPLY_TO = 'carlyfit.lab@gmail.com';
export const PLAN_EMAIL_MAX_ATTEMPTS = 8;
export const PLAN_EMAIL_RETRY_WINDOW = 23 * 60 * 60;
export const PLAN_EMAIL_TIMEOUT_MS = 15000;
const BACKOFF_SECONDS = [60, 300, 900, 3600, 10800, 21600, 43200];
const RECOVERY_BATCH_SIZE = 25;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function enabled(bindings: PlanEmailBindings) {
  const start = bindings.PLAN_EMAIL_START_AT;
  return bindings.PLAN_EMAIL_ENABLED === 'true' && bindings.DB &&
    typeof start === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(start) &&
    Number.isFinite(Date.parse(start)) ? {db: bindings.DB, start: Date.parse(start)} : null;
}

/** The checkout owns the verified Google email snapshot. Never accept a caller-supplied recipient. */
export async function enqueuePlanEmail(bindings: PlanEmailBindings, orderId: string): Promise<boolean> {
  const config = enabled(bindings);
  if (!config || !UUID.test(orderId)) return false;
  const order = await config.db.prepare(`SELECT id,items,user_id,plan_contact_email,created_at
    FROM orders WHERE id=? AND status='approved'`).bind(orderId).first<Order>();
  if (!order || !order.user_id || !UUID.test(order.user_id)) return false;
  const created = Date.parse(order.created_at);
  const email = order.plan_contact_email;
  if (!Number.isFinite(created) || created < config.start || created > Date.now()+300000 || !email || email.length > 254 ||
      !/^[^\s<>;,\x00-\x1f\x7f@]+@[^\s<>;,\x00-\x1f\x7f@]+\.[^\s<>;,\x00-\x1f\x7f@]+$/.test(email)) return false;
  let items: unknown;
  try { items = JSON.parse(order.items); } catch { return false; }
  if (!hasCanonicalPlan(items)) return false;
  const payload = JSON.stringify({from: PLAN_EMAIL_FROM, to: [email], reply_to: PLAN_EMAIL_REPLY_TO, ...buildPlanEmail(order.id)});
  if (payload.length > 100000) throw new Error('Plan email template too large');
  // Recheck the approval/snapshot atomically and preserve the initial payload across redeploys.
  await config.db.prepare(`INSERT INTO plan_emails (order_id,recipient,payload,created_at,next_attempt_at)
    SELECT id,?,?,unixepoch(),unixepoch() FROM orders
    WHERE id=? AND status='approved' AND user_id=? AND plan_contact_email=? AND items=? AND created_at=?
    ON CONFLICT(order_id) DO NOTHING`).bind(email, payload, order.id, order.user_id, email, order.items, order.created_at).run();
  return true;
}

async function expirePending(db: D1Database) {
  // Only final reversal states cancel a receipt; rejected/pending may subsequently be approved.
  await db.prepare(`UPDATE plan_emails SET status='cancelled',recipient=NULL,payload=NULL,
    lease_id=NULL,lease_until=0,finished_at=unixepoch()
    WHERE status='pending' AND lease_until<=unixepoch() AND EXISTS
      (SELECT 1 FROM orders WHERE orders.id=plan_emails.order_id AND orders.status IN ('refunded','cancelled','charged_back'))`).run();
  // Resend's idempotency retention is 24 hours. Stop one hour before it expires.
  await db.prepare(`UPDATE plan_emails SET status='expired',recipient=NULL,payload=NULL,
    lease_id=NULL,lease_until=0,finished_at=unixepoch()
    WHERE status='pending' AND lease_until<=unixepoch() AND
      (attempts>=? OR (first_attempt_at IS NOT NULL AND first_attempt_at<=unixepoch()-?)
       OR (first_attempt_at IS NULL AND created_at<=unixepoch()-604800))`)
    .bind(PLAN_EMAIL_MAX_ATTEMPTS, PLAN_EMAIL_RETRY_WINDOW).run();
}

export async function deliverPlanEmail(bindings: PlanEmailBindings, orderId: string): Promise<void> {
  const config = enabled(bindings);
  const key = bindings.RESEND_API_KEY?.trim();
  if (!config || !key || !UUID.test(orderId)) return;
  const db = config.db;
  await expirePending(db);
  const lease = crypto.randomUUID();
  const claim = await db.prepare(`UPDATE plan_emails SET lease_id=?,lease_until=unixepoch()+90,
    first_attempt_at=COALESCE(first_attempt_at,unixepoch()),attempts=attempts+1
    WHERE order_id=? AND status='pending' AND next_attempt_at<=unixepoch() AND lease_until<=unixepoch()
      AND attempts<? AND (first_attempt_at IS NULL OR first_attempt_at>unixepoch()-?)
      AND EXISTS (SELECT 1 FROM orders WHERE orders.id=plan_emails.order_id AND orders.status='approved'
        AND julianday(orders.created_at)>=julianday(?) AND orders.user_id IS NOT NULL)`)
    .bind(lease, orderId, PLAN_EMAIL_MAX_ATTEMPTS, PLAN_EMAIL_RETRY_WINDOW, new Date(config.start).toISOString()).run();
  if (claim.meta.changes !== 1) return;
  // A second read catches an order reversal committed immediately after the claim.
  const row = await db.prepare(`SELECT e.order_id,e.payload,e.attempts,e.first_attempt_at
    FROM plan_emails e JOIN orders o ON o.id=e.order_id
    WHERE e.order_id=? AND e.lease_id=? AND e.status='pending' AND o.status='approved'`)
    .bind(orderId, lease).first<PendingEmail>();
  if (!row) {
    await db.prepare(`UPDATE plan_emails SET lease_id=NULL,lease_until=0
      WHERE order_id=? AND status='pending' AND lease_id=?`).bind(orderId, lease).run();
    await expirePending(db);
    return;
  }
  let providerId: string | null = null;
  let terminal = false;
  let retryAfter = BACKOFF_SECONDS[Math.min(row.attempts-1, BACKOFF_SECONDS.length-1)];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  try {
    timer = setTimeout(() => abort.abort(), PLAN_EMAIL_TIMEOUT_MS);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `carlyfit-plan-v1:${row.order_id}`},
      body: row.payload,
      signal: abort.signal,
    });
    if (response.ok) {
      const result: unknown = await response.json();
      if (result && typeof result === 'object' && 'id' in result && typeof result.id === 'string' && result.id.length <= 200) providerId = result.id || null;
      // An ambiguous success retries the identical request while its key remains valid.
    } else {
      terminal = response.status >= 400 && response.status < 500 && ![401,403,408,409,425,429].includes(response.status);
      const retryHeader = response.headers.get('Retry-After');
      const seconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : 0;
      retryAfter = Math.max(retryAfter, Math.min(Number.isFinite(seconds) ? seconds : 0, 86400));
      await response.body?.cancel();
    }
  } catch { /* Never log recipient, clinical information, authorization or provider response. */ }
  finally { if (timer !== undefined) clearTimeout(timer); }
  if (providerId || terminal || row.attempts >= PLAN_EMAIL_MAX_ATTEMPTS) {
    await db.prepare(`UPDATE plan_emails SET status=?,provider_id=?,recipient=NULL,payload=NULL,
      lease_id=NULL,lease_until=0,finished_at=unixepoch() WHERE order_id=? AND status='pending' AND lease_id=?`)
      .bind(providerId ? 'sent' : 'failed', providerId, orderId, lease).run();
  } else {
    await db.prepare(`UPDATE plan_emails SET next_attempt_at=unixepoch()+?,lease_id=NULL,lease_until=0
      WHERE order_id=? AND status='pending' AND lease_id=?`).bind(retryAfter, orderId, lease).run();
  }
}

async function recoverApprovedOrders(bindings: PlanEmailBindings, db: D1Database, start: number) {
  await db.prepare(`INSERT INTO plan_email_recovery (id) VALUES ('approved') ON CONFLICT(id) DO NOTHING`).run();
  const cursor = await db.prepare(`SELECT cursor_created_at,cursor_order_id FROM plan_email_recovery WHERE id='approved'`)
    .first<{cursor_created_at: string; cursor_order_id: string}>();
  if (!cursor) return;
  const planIds = CANONICAL_PLAN_IDS.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT o.id,o.created_at FROM orders o
    WHERE o.status='approved' AND o.user_id IS NOT NULL AND o.plan_contact_email IS NOT NULL
      AND julianday(o.created_at)>=julianday(?) AND julianday(o.created_at)<=julianday('now','+5 minutes')
      AND (o.created_at>? OR (o.created_at=? AND o.id>?))
      AND NOT EXISTS (SELECT 1 FROM plan_emails e WHERE e.order_id=o.id)
      AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(o.items) THEN o.items ELSE '[]' END) item
        WHERE item.type='object' AND json_extract(item.value,'$.id') IN (${planIds})
        AND json_type(item.value,'$.quantity')='integer' AND json_extract(item.value,'$.quantity')>0)
    ORDER BY o.created_at,o.id LIMIT ?`)
    .bind(new Date(start).toISOString(), cursor.cursor_created_at, cursor.cursor_created_at, cursor.cursor_order_id,
      ...CANONICAL_PLAN_IDS, RECOVERY_BATCH_SIZE).all<{id: string; created_at: string}>();
  for (const row of rows.results) {
    // Transient enqueue failures are recovered on the next complete pass.
    await enqueuePlanEmail(bindings, row.id).catch(() => {});
  }
  const last = rows.results.length === RECOVERY_BATCH_SIZE ? rows.results.at(-1) : undefined;
  await db.prepare(`UPDATE plan_email_recovery SET cursor_created_at=?,cursor_order_id=? WHERE id='approved'`)
    .bind(last?.created_at ?? '', last?.id ?? '').run();
}

/** Recovers missed webhook enqueue and sends at most five messages per scheduled run. */
export async function processPlanEmailQueue(bindings: PlanEmailBindings): Promise<void> {
  // Cleanup continues while delivery is disabled or the key is missing.
  if (bindings.DB) await expirePending(bindings.DB);
  const config = enabled(bindings);
  if (!config) return;
  await recoverApprovedOrders(bindings, config.db, config.start);
  if (!bindings.RESEND_API_KEY?.trim()) return;
  const rows = await config.db.prepare(`SELECT e.order_id FROM plan_emails e JOIN orders o ON o.id=e.order_id
    WHERE e.status='pending' AND e.next_attempt_at<=unixepoch() AND e.lease_until<=unixepoch() AND o.status='approved'
    ORDER BY e.next_attempt_at,e.created_at LIMIT 5`).all<{order_id: string}>();
  for (let i = 0; i < rows.results.length; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 600));
    await deliverPlanEmail(bindings, rows.results[i].order_id).catch(() => {});
  }
}
