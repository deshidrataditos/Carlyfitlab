-- Set only from a verified Google session at checkout, for new plan purchases.
-- Historical orders deliberately receive no recipient backfill.
ALTER TABLE orders ADD COLUMN plan_contact_email TEXT;
--> statement-breakpoint
-- Durable receipts prevent repeat onboarding, including after terminal failures.
CREATE TABLE plan_emails (
  order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','expired','cancelled')),
  recipient TEXT,
  payload TEXT,
  created_at INTEGER NOT NULL,
  first_attempt_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_id TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  finished_at INTEGER,
  CHECK ((status='pending' AND recipient IS NOT NULL AND payload IS NOT NULL) OR
         (status<>'pending' AND recipient IS NULL AND payload IS NULL))
);
--> statement-breakpoint
CREATE INDEX plan_emails_pending ON plan_emails(status,next_attempt_at,lease_until);
--> statement-breakpoint
-- A bounded recovery scan advances past malformed candidates and wraps on completion.
CREATE TABLE plan_email_recovery (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='approved'),
  cursor_created_at TEXT NOT NULL DEFAULT '',
  cursor_order_id TEXT NOT NULL DEFAULT ''
);
