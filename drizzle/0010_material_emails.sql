-- A storage registration must succeed before a published file is announced.
-- Historical materials intentionally receive no readiness or email backfill.
ALTER TABLE store_materials ADD COLUMN access_published_at TEXT;
--> statement-breakpoint
CREATE TABLE material_emails (
  material_id TEXT PRIMARY KEY NOT NULL REFERENCES store_materials(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  user_id TEXT NOT NULL,
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
CREATE INDEX material_emails_pending ON material_emails(status,next_attempt_at,lease_until);
--> statement-breakpoint
CREATE TABLE material_email_recovery (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='published'),
  cursor_published_at TEXT NOT NULL DEFAULT '',
  cursor_material_id TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX store_materials_published_email_idx ON store_materials(state,published_at,id);
