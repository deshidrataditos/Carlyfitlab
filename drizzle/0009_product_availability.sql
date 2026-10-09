-- Capacity is optional. No count is inferred from the public catalog.
ALTER TABLE orders ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'legacy' CHECK (availability_status IN ('legacy','reserved','confirmed','released','conflict'));
--> statement-breakpoint
CREATE TABLE product_availability (
  product_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','made_to_order','sold_out')),
  capacity INTEGER CHECK (capacity IS NULL OR (capacity>=0 AND capacity<=1000000)),
  max_per_order INTEGER CHECK (max_per_order IS NULL OR (max_per_order>=1 AND max_per_order<=1000)),
  held INTEGER NOT NULL DEFAULT 0 CHECK (held>=0),
  committed INTEGER NOT NULL DEFAULT 0 CHECK (committed>=0),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by TEXT,
  CHECK (capacity IS NULL OR capacity>=held+committed)
);
--> statement-breakpoint
INSERT INTO product_availability(product_id,status) VALUES
 ('rutina-90','available'),('integral-90','available'),('dulce-90','available'),
 ('presencial-mensual','sold_out'),('mermelada','available'),('galletas','available'),
 ('core-cookie','available'),('golden-milk','available'),('pastel-zanahoria','made_to_order'),
 ('pastel-zanahoria-grande','made_to_order'),('tiramisu','available'),
 ('minitartaleta-pina-datil','available'),('cheesecake-carlyfit','made_to_order'),
 ('cheesecake-carlyfit-grande','made_to_order');
--> statement-breakpoint
CREATE TABLE product_reservations (
  order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
  state TEXT NOT NULL CHECK (state IN ('held','expired','committed','released','conflict')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at>created_at),
  next_check_at INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX product_reservations_expiry ON product_reservations(state,expires_at);
--> statement-breakpoint
CREATE TABLE checkout_attempts (bucket TEXT PRIMARY KEY NOT NULL,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER product_reservation_budget BEFORE INSERT ON product_reservations
BEGIN
  SELECT RAISE(ABORT,'reservation_budget') WHERE (SELECT count(*) FROM product_reservations WHERE state IN ('held','expired'))>=1000;
END;
--> statement-breakpoint
CREATE TABLE product_reservation_items (
  order_id TEXT NOT NULL REFERENCES product_reservations(order_id),
  product_id TEXT NOT NULL REFERENCES product_availability(product_id),
  quantity INTEGER NOT NULL CHECK (quantity>=1 AND quantity<=1000),
  PRIMARY KEY (order_id,product_id)
);
--> statement-breakpoint
-- Runs inside the reservation batch: all SKUs succeed, or all roll back.
CREATE TRIGGER product_reservation_capacity BEFORE INSERT ON product_reservation_items
BEGIN
  UPDATE product_availability SET held=held+NEW.quantity,version=version+1
  WHERE product_id=NEW.product_id AND status<>'sold_out'
    AND (max_per_order IS NULL OR NEW.quantity<=max_per_order)
    AND (capacity IS NULL OR held+committed+NEW.quantity<=capacity)
    AND EXISTS (SELECT 1 FROM product_reservations WHERE order_id=NEW.order_id AND state='held');
  SELECT RAISE(ABORT,'availability_conflict') WHERE changes()<>1;
END;
--> statement-breakpoint
CREATE TRIGGER product_reservation_order AFTER INSERT ON product_reservations
BEGIN
  UPDATE orders SET availability_status='reserved' WHERE id=NEW.order_id;
END;
--> statement-breakpoint
CREATE TRIGGER product_reservation_state AFTER UPDATE OF state ON product_reservations
BEGIN
  UPDATE orders SET availability_status = iif(NEW.state='committed','confirmed',iif(NEW.state='released','released',iif(NEW.state='conflict','conflict','reserved'))) WHERE id=NEW.order_id;
END;
--> statement-breakpoint
-- Close the interval between authoritative payment persistence and application
-- reconciliation: fulfillment must never observe an approved, released reserve.
CREATE TRIGGER product_reservation_late_payment AFTER UPDATE OF status ON orders
WHEN NEW.status='approved'
BEGIN
  UPDATE product_reservations SET state='conflict' WHERE order_id=NEW.id AND state='released';
END;
--> statement-breakpoint
CREATE TRIGGER product_reservation_release AFTER UPDATE OF state ON product_reservations
WHEN OLD.state IN ('held','expired') AND NEW.state='released'
BEGIN
  UPDATE product_availability SET
    held=held-(SELECT quantity FROM product_reservation_items WHERE order_id=NEW.order_id AND product_id=product_availability.product_id),version=version+1
  WHERE product_id IN (SELECT product_id FROM product_reservation_items WHERE order_id=NEW.order_id);
END;
--> statement-breakpoint
-- An administrator may assign freshly verified capacity to a late paid order.
-- Validate every SKU before changing any counter, so no partial assignment exists.
CREATE TRIGGER product_reservation_late_allocation BEFORE UPDATE OF state ON product_reservations
WHEN OLD.state='conflict' AND NEW.state='committed'
BEGIN
  SELECT RAISE(ABORT,'availability_conflict') WHERE EXISTS (
    SELECT 1 FROM product_reservation_items i JOIN product_availability p ON p.product_id=i.product_id
    WHERE i.order_id=NEW.order_id AND (p.status='sold_out' OR (p.capacity IS NOT NULL AND p.held+p.committed+i.quantity>p.capacity))
  );
  UPDATE product_availability SET
    committed=committed+(SELECT quantity FROM product_reservation_items WHERE order_id=NEW.order_id AND product_id=product_availability.product_id),version=version+1
  WHERE product_id IN (SELECT product_id FROM product_reservation_items WHERE order_id=NEW.order_id);
END;
--> statement-breakpoint
-- Expiration stops the checkout, but never frees capacity on an uncertain payment.
-- A late approval consumes the SAME held units; reversals never restock delivered goods.
CREATE TRIGGER product_reservation_commit AFTER UPDATE OF state ON product_reservations
WHEN OLD.state IN ('held','expired') AND NEW.state='committed'
BEGIN
  UPDATE product_availability SET
    held=held-(SELECT quantity FROM product_reservation_items WHERE order_id=NEW.order_id AND product_id=product_availability.product_id),
    committed=committed+(SELECT quantity FROM product_reservation_items WHERE order_id=NEW.order_id AND product_id=product_availability.product_id),
    version=version+1
  WHERE product_id IN (SELECT product_id FROM product_reservation_items WHERE order_id=NEW.order_id);
END;
