import {buildMaterialEmail} from './material-email-template';
import {CANONICAL_PLAN_IDS, hasCanonicalPlan} from './plan-onboarding';

export type MaterialEmailBindings = {
  DB?: D1Database;
  MATERIAL_EMAIL_ENABLED?: string;
  MATERIAL_EMAIL_START_AT?: string;
  RESEND_API_KEY?: string;
};
type PublishedMaterial = {id: string; order_id: string; user_id: string; title: string; items: string; plan_contact_email: string | null; published_at: string; access_published_at: string};
type PendingEmail = {material_id: string; payload: string; attempts: number; first_attempt_at: number};
export type MaterialEmailStatus = 'pending' | 'sent' | 'failed' | 'expired' | 'cancelled' | 'disabled' | 'unavailable' | 'retry_pending';

export const MATERIAL_EMAIL_FROM = 'Carlyfit Lab <hola@correo.carlyfitlab.com>';
export const MATERIAL_EMAIL_REPLY_TO = 'carlyfit.lab@gmail.com';
export const MATERIAL_EMAIL_MAX_ATTEMPTS = 8;
export const MATERIAL_EMAIL_RETRY_WINDOW = 23 * 60 * 60;
export const MATERIAL_EMAIL_TIMEOUT_MS = 15000;
const BACKOFF_SECONDS = [60, 300, 900, 3600, 10800, 21600, 43200];
const RECOVERY_BATCH_SIZE = 25;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function enabled(bindings: MaterialEmailBindings) {
  const start = bindings.MATERIAL_EMAIL_START_AT;
  return bindings.MATERIAL_EMAIL_ENABLED === 'true' && bindings.DB &&
    typeof start === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(start) &&
    Number.isFinite(Date.parse(start)) ? {db: bindings.DB, start: Date.parse(start)} : null;
}

/** Accept a published material ID only; recipient always comes from its verified purchase snapshot. */
export async function enqueueMaterialEmail(bindings: MaterialEmailBindings, materialId: string): Promise<boolean> {
  const config = enabled(bindings);
  if (!config || !UUID.test(materialId)) return false;
  const material = await config.db.prepare(`SELECT m.id,m.order_id,m.user_id,m.title,m.published_at,m.access_published_at,o.items,o.plan_contact_email
    FROM store_materials m JOIN orders o ON o.id=m.order_id AND o.user_id=m.user_id
    WHERE m.id=? AND m.state='published' AND m.access_published_at IS NOT NULL AND o.status='approved'`)
    .bind(materialId).first<PublishedMaterial>();
  if (!material || !UUID.test(material.user_id) || !UUID.test(material.order_id)) return false;
  const published = Date.parse(material.published_at);
  const accessible = Date.parse(material.access_published_at);
  const email = material.plan_contact_email;
  if (!Number.isFinite(published) || published < config.start || published > Date.now()+300000 ||
      !Number.isFinite(accessible) || accessible < published || accessible > Date.now()+300000 || !email || email.length > 254 ||
      !/^[^\s<>;,\x00-\x1f\x7f@]+@[^\s<>;,\x00-\x1f\x7f@]+\.[^\s<>;,\x00-\x1f\x7f@]+$/.test(email)) return false;
  let items: unknown;
  try { items = JSON.parse(material.items); } catch { return false; }
  if (!hasCanonicalPlan(items)) return false;
  const payload = JSON.stringify({from: MATERIAL_EMAIL_FROM, to: [email], reply_to: MATERIAL_EMAIL_REPLY_TO,
    ...buildMaterialEmail(material.order_id, material.title)});
  if (payload.length > 100000) throw new Error('Material email template too large');
  // Recheck the approval/snapshot atomically and preserve the initial payload across redeploys.
  await config.db.prepare(`INSERT INTO material_emails (material_id,order_id,user_id,recipient,payload,created_at,next_attempt_at)
    SELECT m.id,m.order_id,m.user_id,?,?,unixepoch(),unixepoch() FROM store_materials m
    JOIN orders o ON o.id=m.order_id AND o.user_id=m.user_id
    WHERE m.id=? AND m.order_id=? AND m.user_id=? AND m.state='published' AND m.published_at=? AND m.access_published_at=?
      AND o.status='approved' AND o.plan_contact_email=? AND o.items=?
    ON CONFLICT(material_id) DO NOTHING`).bind(email, payload, material.id, material.order_id, material.user_id,
      material.published_at, material.access_published_at, email, material.items).run();
  return true;
}

/** Non-sensitive delivery receipt for the administrator's publication response. */
export async function materialEmailStatus(bindings: MaterialEmailBindings, materialId: string): Promise<MaterialEmailStatus> {
  const config = enabled(bindings);
  if (!config) return 'disabled';
  if (!UUID.test(materialId)) return 'unavailable';
  const row = await config.db.prepare('SELECT status FROM material_emails WHERE material_id=?').bind(materialId)
    .first<{status: MaterialEmailStatus}>();
  return row?.status ?? 'unavailable';
}

async function expirePending(db: D1Database) {
  // Only final reversal states cancel a receipt; rejected/pending may subsequently be approved.
  await db.prepare(`UPDATE material_emails SET status='cancelled',recipient=NULL,payload=NULL,
    lease_id=NULL,lease_until=0,finished_at=unixepoch()
    WHERE status='pending' AND lease_until<=unixepoch() AND (NOT EXISTS
      (SELECT 1 FROM store_materials m JOIN orders o ON o.id=m.order_id AND o.user_id=m.user_id
       WHERE m.id=material_emails.material_id AND m.order_id=material_emails.order_id AND m.user_id=material_emails.user_id
         AND m.state='published' AND m.access_published_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM orders WHERE orders.id=material_emails.order_id AND orders.status IN ('refunded','cancelled','charged_back')))`)
    .run();
  // Resend's idempotency retention is 24 hours. Stop one hour before it expires.
  await db.prepare(`UPDATE material_emails SET status='expired',recipient=NULL,payload=NULL,
    lease_id=NULL,lease_until=0,finished_at=unixepoch()
    WHERE status='pending' AND lease_until<=unixepoch() AND
      (attempts>=? OR (first_attempt_at IS NOT NULL AND first_attempt_at<=unixepoch()-?)
       OR (first_attempt_at IS NULL AND created_at<=unixepoch()-604800))`)
    .bind(MATERIAL_EMAIL_MAX_ATTEMPTS, MATERIAL_EMAIL_RETRY_WINDOW).run();
}

export async function deliverMaterialEmail(bindings: MaterialEmailBindings, materialId: string): Promise<void> {
  const config = enabled(bindings);
  const key = bindings.RESEND_API_KEY?.trim();
  if (!config || !key || !UUID.test(materialId)) return;
  const db = config.db;
  await expirePending(db);
  const lease = crypto.randomUUID();
  const claim = await db.prepare(`UPDATE material_emails SET lease_id=?,lease_until=unixepoch()+90,
    first_attempt_at=COALESCE(first_attempt_at,unixepoch()),attempts=attempts+1
    WHERE material_id=? AND status='pending' AND next_attempt_at<=unixepoch() AND lease_until<=unixepoch()
      AND attempts<? AND (first_attempt_at IS NULL OR first_attempt_at>unixepoch()-?)
      AND EXISTS (SELECT 1 FROM store_materials m JOIN orders o ON o.id=m.order_id AND o.user_id=m.user_id
        WHERE m.id=material_emails.material_id AND m.order_id=material_emails.order_id AND m.user_id=material_emails.user_id
          AND m.state='published' AND m.access_published_at IS NOT NULL AND o.status='approved'
          AND julianday(m.published_at)>=julianday(?))`)
    .bind(lease, materialId, MATERIAL_EMAIL_MAX_ATTEMPTS, MATERIAL_EMAIL_RETRY_WINDOW, new Date(config.start).toISOString()).run();
  if (claim.meta.changes !== 1) return;
  // A second read catches an order reversal committed immediately after the claim.
  const row = await db.prepare(`SELECT e.material_id,e.payload,e.attempts,e.first_attempt_at
    FROM material_emails e JOIN store_materials m ON m.id=e.material_id AND m.order_id=e.order_id AND m.user_id=e.user_id
    JOIN orders o ON o.id=m.order_id AND o.user_id=m.user_id
    WHERE e.material_id=? AND e.lease_id=? AND e.status='pending' AND m.state='published'
      AND m.access_published_at IS NOT NULL AND o.status='approved'`)
    .bind(materialId, lease).first<PendingEmail>();
  if (!row) {
    await db.prepare(`UPDATE material_emails SET lease_id=NULL,lease_until=0
      WHERE material_id=? AND status='pending' AND lease_id=?`).bind(materialId, lease).run();
    await expirePending(db);
    return;
  }
  let providerId: string | null = null;
  let terminal = false;
  let retryAfter = BACKOFF_SECONDS[Math.min(row.attempts-1, BACKOFF_SECONDS.length-1)];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  try {
    timer = setTimeout(() => abort.abort(), MATERIAL_EMAIL_TIMEOUT_MS);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `carlyfit-material-v1:${row.material_id}`},
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
  if (providerId || terminal || row.attempts >= MATERIAL_EMAIL_MAX_ATTEMPTS) {
    await db.prepare(`UPDATE material_emails SET status=?,provider_id=?,recipient=NULL,payload=NULL,
      lease_id=NULL,lease_until=0,finished_at=unixepoch() WHERE material_id=? AND status='pending' AND lease_id=?`)
      .bind(providerId ? 'sent' : 'failed', providerId, materialId, lease).run();
  } else {
    await db.prepare(`UPDATE material_emails SET next_attempt_at=unixepoch()+?,lease_id=NULL,lease_until=0
      WHERE material_id=? AND status='pending' AND lease_id=?`).bind(retryAfter, materialId, lease).run();
  }
}

async function recoverPublishedMaterials(bindings: MaterialEmailBindings, db: D1Database, start: number) {
  await db.prepare(`INSERT INTO material_email_recovery (id) VALUES ('published') ON CONFLICT(id) DO NOTHING`).run();
  const cursor = await db.prepare(`SELECT cursor_published_at,cursor_material_id FROM material_email_recovery WHERE id='published'`)
    .first<{cursor_published_at: string; cursor_material_id: string}>();
  if (!cursor) return;
  const planIds = CANONICAL_PLAN_IDS.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT m.id,m.published_at FROM store_materials m
    JOIN orders o ON o.id=m.order_id AND o.user_id=m.user_id
    WHERE o.status='approved' AND o.plan_contact_email IS NOT NULL AND m.state='published' AND m.access_published_at IS NOT NULL
      AND julianday(m.published_at)>=julianday(?) AND julianday(m.published_at)<=julianday('now','+5 minutes')
      AND (m.published_at>? OR (m.published_at=? AND m.id>?))
      AND NOT EXISTS (SELECT 1 FROM material_emails e WHERE e.material_id=m.id)
      AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(o.items) THEN o.items ELSE '[]' END) item
        WHERE item.type='object' AND json_extract(item.value,'$.id') IN (${planIds})
        AND json_type(item.value,'$.quantity')='integer' AND json_extract(item.value,'$.quantity')>0)
    ORDER BY m.published_at,m.id LIMIT ?`)
    .bind(new Date(start).toISOString(), cursor.cursor_published_at, cursor.cursor_published_at, cursor.cursor_material_id,
      ...CANONICAL_PLAN_IDS, RECOVERY_BATCH_SIZE).all<{id: string; published_at: string}>();
  for (const row of rows.results) {
    // Transient enqueue failures are recovered on the next complete pass.
    await enqueueMaterialEmail(bindings, row.id).catch(() => {});
  }
  const last = rows.results.length === RECOVERY_BATCH_SIZE ? rows.results.at(-1) : undefined;
  await db.prepare(`UPDATE material_email_recovery SET cursor_published_at=?,cursor_material_id=? WHERE id='published'`)
    .bind(last?.published_at ?? '', last?.id ?? '').run();
}

/** Recovers a lost publication enqueue and sends at most five messages per scheduled run. */
export async function processMaterialEmailQueue(bindings: MaterialEmailBindings): Promise<void> {
  // Cleanup continues while delivery is disabled or the key is missing.
  if (bindings.DB) await expirePending(bindings.DB);
  const config = enabled(bindings);
  if (!config) return;
  await recoverPublishedMaterials(bindings, config.db, config.start);
  if (!bindings.RESEND_API_KEY?.trim()) return;
  const rows = await config.db.prepare(`SELECT e.material_id FROM material_emails e
    JOIN store_materials m ON m.id=e.material_id AND m.order_id=e.order_id AND m.user_id=e.user_id
    JOIN orders o ON o.id=m.order_id AND o.user_id=m.user_id
    WHERE e.status='pending' AND e.next_attempt_at<=unixepoch() AND e.lease_until<=unixepoch()
      AND m.state='published' AND m.access_published_at IS NOT NULL AND o.status='approved'
    ORDER BY e.next_attempt_at,e.created_at LIMIT 5`).all<{material_id: string}>();
  for (let i = 0; i < rows.results.length; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 600));
    await deliverMaterialEmail(bindings, rows.results[i].material_id).catch(() => {});
  }
}
