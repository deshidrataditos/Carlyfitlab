-- Civil dates in America/Mexico_City. No start date is inferred from payment.
ALTER TABLE orders ADD COLUMN requested_delivery_date TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN estimated_delivery_date TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN plan_started_on TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN plan_progress_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE plan_progress_sessions (
  order_id TEXT NOT NULL REFERENCES orders(id),
  session_on TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK (completed IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id,session_on)
);
--> statement-breakpoint
CREATE TABLE plan_progress_reviews (
  order_id TEXT NOT NULL REFERENCES orders(id),
  day INTEGER NOT NULL CHECK (day IN (30,60,90)),
  comment TEXT NOT NULL CHECK (length(comment) BETWEEN 3 AND 1200),
  feedback TEXT CHECK (feedback IS NULL OR length(feedback) BETWEEN 3 AND 1200),
  updated_at TEXT NOT NULL,
  feedback_at TEXT,
  PRIMARY KEY (order_id,day)
);
--> statement-breakpoint
-- Idempotency receipts contain a payload digest, never the private comments.
CREATE TABLE plan_progress_mutations (
  request_id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  actor_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX plan_progress_mutations_order_idx ON plan_progress_mutations(order_id,version);
