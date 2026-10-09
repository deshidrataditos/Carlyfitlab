import {buildWelcomeEmail} from './welcome-email-template';

export type WelcomeEmailBindings = {
  DB?: D1Database;
  WELCOME_EMAIL_ENABLED?: string;
  WELCOME_EMAIL_START_AT?: string;
  RESEND_API_KEY?: string;
};
type VerifiedUser = {
  id: string;
  email?: string;
  created_at: string;
  email_confirmed_at?: string;
  is_anonymous?: boolean;
  app_metadata?: {provider?: string; providers?: unknown};
};
type PendingEmail = {user_id: string; payload: string; attempts: number; first_attempt_at: number};

export const WELCOME_EMAIL_FROM = 'Carlyfit Lab <hola@correo.carlyfitlab.com>';
export const WELCOME_EMAIL_REPLY_TO = 'carlyfit.lab@gmail.com';
export const WELCOME_EMAIL_MAX_ATTEMPTS = 8;
export const WELCOME_EMAIL_RETRY_WINDOW = 23 * 60 * 60;
export const WELCOME_EMAIL_TIMEOUT_MS = 15000;
const BACKOFF_SECONDS = [60, 300, 900, 3600, 10800, 21600, 43200];

function enabled(bindings: WelcomeEmailBindings) {
  const start = bindings.WELCOME_EMAIL_START_AT;
  return bindings.WELCOME_EMAIL_ENABLED === 'true' && bindings.DB &&
    typeof start === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(start) &&
    Number.isFinite(Date.parse(start)) ? {db: bindings.DB, start: Date.parse(start)} : null;
}

/** Call only with the server-validated result of Supabase auth.getUser(). */
export async function enqueueWelcomeEmail(bindings: WelcomeEmailBindings, user: VerifiedUser): Promise<boolean> {
  const config = enabled(bindings);
  if (!config || user.is_anonymous || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(user.id)) return false;
  const created = Date.parse(user.created_at);
  const confirmed = Date.parse(user.email_confirmed_at ?? '');
  const google = user.app_metadata?.provider === 'google' ||
    (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google'));
  const email = user.email;
  if (!google || !Number.isFinite(created) || created < config.start || created > Date.now()+300000 ||
      !Number.isFinite(confirmed) || confirmed > Date.now()+300000 || !email || email.length > 254 ||
      !/^[^\s<>;,\x00-\x1f\x7f@]+@[^\s<>;,\x00-\x1f\x7f@]+\.[^\s<>;,\x00-\x1f\x7f@]+$/.test(email)) return false;
  const template = buildWelcomeEmail();
  const payload = JSON.stringify({from: WELCOME_EMAIL_FROM, to: [email], reply_to: WELCOME_EMAIL_REPLY_TO, ...template});
  if (payload.length > 100000) throw new Error('Welcome email template too large');
  // Preserve the initial recipient and complete payload, including across deployments.
  await config.db.prepare(`INSERT INTO welcome_emails (user_id,recipient,payload,created_at,next_attempt_at)
    VALUES (?,?,?,unixepoch(),unixepoch()) ON CONFLICT(user_id) DO NOTHING`).bind(user.id, email, payload).run();
  return true;
}

async function expirePending(db: D1Database) {
  // Never retry after Resend's 24-hour idempotency lifetime. Keep a one-hour margin.
  await db.prepare(`UPDATE welcome_emails SET status='expired',recipient=NULL,payload=NULL,
    lease_id=NULL,lease_until=0,finished_at=unixepoch()
    WHERE status='pending' AND lease_until<=unixepoch() AND
      (attempts>=? OR (first_attempt_at IS NOT NULL AND first_attempt_at<=unixepoch()-?)
       OR (first_attempt_at IS NULL AND created_at<=unixepoch()-604800))`)
    .bind(WELCOME_EMAIL_MAX_ATTEMPTS, WELCOME_EMAIL_RETRY_WINDOW).run();
}

export async function deliverWelcomeEmail(bindings: WelcomeEmailBindings, userId: string): Promise<void> {
  const config = enabled(bindings);
  const key = bindings.RESEND_API_KEY?.trim();
  if (!config || !key) return;
  const db = config.db;
  await expirePending(db);
  const lease = crypto.randomUUID();
  // The same atomic UPDATE fences simultaneous callback, account and cron requests.
  const claim = await db.prepare(`UPDATE welcome_emails SET lease_id=?,lease_until=unixepoch()+90,
    first_attempt_at=COALESCE(first_attempt_at,unixepoch()),attempts=attempts+1
    WHERE user_id=? AND status='pending' AND next_attempt_at<=unixepoch() AND lease_until<=unixepoch()
      AND attempts<? AND (first_attempt_at IS NULL OR first_attempt_at>unixepoch()-?)`)
    .bind(lease, userId, WELCOME_EMAIL_MAX_ATTEMPTS, WELCOME_EMAIL_RETRY_WINDOW).run();
  if (claim.meta.changes !== 1) return;
  const row = await db.prepare('SELECT user_id,payload,attempts,first_attempt_at FROM welcome_emails WHERE user_id=? AND lease_id=?')
    .bind(userId, lease).first<PendingEmail>();
  if (!row) return;
  let providerId: string | null = null;
  let terminal = false;
  let retryAfter = BACKOFF_SECONDS[Math.min(row.attempts-1, BACKOFF_SECONDS.length-1)];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  try {
    timer = setTimeout(() => abort.abort(), WELCOME_EMAIL_TIMEOUT_MS);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `carlyfit-welcome-v1:${row.user_id}`},
      body: row.payload,
      signal: abort.signal,
    });
    if (response.ok) {
      const result: unknown = await response.json();
      if (result && typeof result === 'object' && 'id' in result && typeof result.id === 'string' && result.id.length <= 200) providerId = result.id || null;
      // An unreadable successful response is ambiguous: retry the identical idempotent request.
    } else {
      // Configuration/transient conflicts remain retryable. Never retain provider error bodies.
      terminal = response.status >= 400 && response.status < 500 && ![401,403,408,409,425,429].includes(response.status);
      const retryHeader = response.headers.get('Retry-After');
      const seconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : 0;
      retryAfter = Math.max(retryAfter, Math.min(Number.isFinite(seconds) ? seconds : 0, 86400));
      await response.body?.cancel();
    }
  } catch { /* Do not log recipient, content, authorization or provider response. */ }
  finally { if (timer !== undefined) clearTimeout(timer); }
  if (providerId || terminal || row.attempts >= WELCOME_EMAIL_MAX_ATTEMPTS) {
    await db.prepare(`UPDATE welcome_emails SET status=?,provider_id=?,recipient=NULL,payload=NULL,
      lease_id=NULL,lease_until=0,finished_at=unixepoch() WHERE user_id=? AND status='pending' AND lease_id=?`)
      .bind(providerId ? 'sent' : 'failed', providerId, userId, lease).run();
  } else {
    await db.prepare(`UPDATE welcome_emails SET next_attempt_at=unixepoch()+?,lease_id=NULL,lease_until=0
      WHERE user_id=? AND status='pending' AND lease_id=?`).bind(retryAfter, userId, lease).run();
  }
}

/** Scheduler does not depend on a browser session and never accepts client recipients. */
export async function processWelcomeEmailQueue(bindings: WelcomeEmailBindings): Promise<void> {
  // Retention cleanup must continue even while sending is disabled or misconfigured.
  if (bindings.DB) await expirePending(bindings.DB);
  const config = enabled(bindings);
  if (!config) return;
  if (!bindings.RESEND_API_KEY?.trim()) return;
  const rows = await config.db.prepare(`SELECT user_id FROM welcome_emails
    WHERE status='pending' AND next_attempt_at<=unixepoch() AND lease_until<=unixepoch()
    ORDER BY next_attempt_at,created_at LIMIT 5`).all<{user_id: string}>();
  for (let i = 0; i < rows.results.length; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 600));
    await deliverWelcomeEmail(bindings, rows.results[i].user_id).catch(() => {});
  }
}
