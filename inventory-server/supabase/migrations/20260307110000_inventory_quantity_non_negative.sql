-- Data integrity: prevent negative stock (over-deduction). Any UPDATE that would set quantity < 0 will fail.
-- Ensures sales/record_sale and any other writer never persist invalid state.

-- One-time correction: clamp any existing negative quantities to 0 (audit separately if needed).
UPDATE warehouse_inventory SET quantity = 0 WHERE quantity < 0;
UPDATE warehouse_inventory_by_size SET quantity = 0 WHERE quantity < 0;

ALTER TABLE warehouse_inventory
  DROP CONSTRAINT IF EXISTS warehouse_inventory_quantity_non_negative,
  ADD CONSTRAINT warehouse_inventory_quantity_non_negative CHECK (quantity >= 0);

ALTER TABLE warehouse_inventory_by_size
  DROP CONSTRAINT IF EXISTS warehouse_inventory_by_size_quantity_non_negative,
  ADD CONSTRAINT warehouse_inventory_by_size_quantity_non_negative CHECK (quantity >= 0);

COMMENT ON CONSTRAINT warehouse_inventory_quantity_non_negative ON warehouse_inventory IS 'Prevent over-deduction; quantity must be >= 0.';
COMMENT ON CONSTRAINT warehouse_inventory_by_size_quantity_non_negative ON warehouse_inventory_by_size IS 'Prevent over-deduction; quantity must be >= 0.';
