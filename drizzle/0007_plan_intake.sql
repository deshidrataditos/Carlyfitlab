-- Receipt confirmation only. Clinical answers stay in the private Google Form.
ALTER TABLE orders ADD COLUMN intake_received_at text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN intake_received_by text;
