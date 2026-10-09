-- One receipt per Auth user. Never delete receipts: they prevent repeat welcomes.
-- Recipient and immutable provider payload are removed after any terminal result.
CREATE TABLE welcome_emails (
  user_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','expired')),
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
CREATE INDEX welcome_emails_pending ON welcome_emails(status,next_attempt_at,lease_until);
