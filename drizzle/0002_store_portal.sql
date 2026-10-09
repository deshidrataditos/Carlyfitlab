-- Apply once after 0001. Historical and guest orders remain unclaimed.
ALTER TABLE orders ADD COLUMN user_id text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'received' CHECK (fulfillment_status IN ('received','preparing','ready','shipped','delivered'));
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN fulfillment_note text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN dessert_selection text;
--> statement-breakpoint
CREATE INDEX orders_user_created_idx ON orders(user_id,created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX orders_status_created_idx ON orders(status,created_at DESC,id DESC);
--> statement-breakpoint
CREATE TABLE member_directory (
  user_id text PRIMARY KEY NOT NULL,
  email text,
  display_name text NOT NULL DEFAULT '',
  updated_at text NOT NULL
);
--> statement-breakpoint
CREATE TABLE store_intake (
  user_id text PRIMARY KEY NOT NULL,
  goal text NOT NULL CHECK (length(goal) BETWEEN 3 AND 240),
  experience text NOT NULL CHECK (experience IN ('beginner','intermediate','advanced')),
  place text NOT NULL CHECK (place IN ('home','gym')),
  days integer NOT NULL CHECK (days BETWEEN 1 AND 7),
  minutes integer NOT NULL CHECK (minutes BETWEEN 15 AND 180),
  equipment text NOT NULL CHECK (length(equipment)<=1000),
  updated_at text NOT NULL
);
--> statement-breakpoint
CREATE TABLE store_materials (
  id text PRIMARY KEY NOT NULL,
  order_id text NOT NULL REFERENCES orders(id),
  user_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  kind text NOT NULL CHECK (kind IN ('routine','nutrition','video')),
  object_path text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('application/pdf','video/mp4','video/webm')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 47185920),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','published','deleted')),
  created_by text NOT NULL,
  created_at text NOT NULL,
  expires_at text NOT NULL,
  published_at text,
  CHECK ((kind='video' AND content_type IN ('video/mp4','video/webm')) OR (kind IN ('routine','nutrition') AND content_type='application/pdf'))
);
--> statement-breakpoint
CREATE INDEX store_materials_order_state_idx ON store_materials(order_id,state,created_at DESC);
--> statement-breakpoint
CREATE INDEX store_materials_user_state_idx ON store_materials(user_id,state);
--> statement-breakpoint
CREATE TABLE store_audit (
  id text PRIMARY KEY NOT NULL,
  actor_id text NOT NULL,
  order_id text,
  action text NOT NULL,
  details text NOT NULL,
  created_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX store_audit_order_created_idx ON store_audit(order_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE store_content (
  id text PRIMARY KEY NOT NULL CHECK (id='public'),
  content text NOT NULL,
  updated_by text NOT NULL,
  updated_at text NOT NULL
);
