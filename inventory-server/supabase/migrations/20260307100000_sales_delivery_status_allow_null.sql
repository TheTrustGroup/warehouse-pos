-- Fix 500 on POST /api/sales: allow NULL delivery_status for direct (non-delivery) sales.
-- Error was: null value in column "delivery_status" of relation "sales" violates not-null constraint.
-- Design: delivery_status is NULL for direct sales; 'pending'|'dispatched'|'delivered'|'cancelled' for delivery sales.

ALTER TABLE sales
  ALTER COLUMN delivery_status DROP NOT NULL;

COMMENT ON COLUMN sales.delivery_status IS 'pending | dispatched | delivered | cancelled. Null = direct sale (no delivery).';
