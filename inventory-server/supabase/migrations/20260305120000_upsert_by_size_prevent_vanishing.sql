-- DATA INTEGRITY: Replace DELETE+INSERT of warehouse_inventory_by_size with UPSERT.
-- Only delete size rows that are explicitly removed from the payload; upsert the rest.
-- Prevents "vanishing sizes" when payload is incomplete or empty array is sent by mistake.
-- Also: ensure quantity >= 0 and sync warehouse_inventory.quantity from sum(by_size).

-- 1. Add CHECK (quantity >= 0) if not present (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'warehouse_inventory_by_size'::regclass
      AND conname = 'warehouse_inventory_by_size_quantity_nonneg'
  ) THEN
    ALTER TABLE warehouse_inventory_by_size
      ADD CONSTRAINT warehouse_inventory_by_size_quantity_nonneg CHECK (quantity >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'warehouse_inventory'::regclass
      AND conname = 'warehouse_inventory_quantity_nonneg'
  ) THEN
    ALTER TABLE warehouse_inventory
      ADD CONSTRAINT warehouse_inventory_quantity_nonneg CHECK (quantity >= 0);
  END IF;
END $$;

-- 2. Replace update_warehouse_product_atomic to use UPSERT for by_size
CREATE OR REPLACE FUNCTION update_warehouse_product_atomic(
  p_id uuid,
  p_warehouse_id uuid,
  p_row jsonb,
  p_current_version int,
  p_quantity int default null,
  p_quantity_by_size jsonb default null
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated int;
  v_qty int;
  v_entry jsonb;
  v_size_code text;
  v_size_qty int;
  v_payload_codes text[];
BEGIN
  UPDATE warehouse_products SET
    sku = coalesce(nullif(trim(p_row->>'sku'), ''), sku),
    barcode = coalesce(trim(p_row->>'barcode'), barcode),
    name = coalesce(nullif(trim(p_row->>'name'), ''), name),
    description = coalesce(p_row->>'description', description),
    category = coalesce(p_row->>'category', category),
    tags = coalesce(p_row->'tags', tags),
    cost_price = coalesce((p_row->>'cost_price')::decimal, (p_row->>'costPrice')::decimal, cost_price),
    selling_price = coalesce((p_row->>'selling_price')::decimal, (p_row->>'sellingPrice')::decimal, selling_price),
    reorder_level = coalesce((p_row->>'reorder_level')::int, (p_row->>'reorderLevel')::int, reorder_level),
    location = coalesce(p_row->'location', location),
    supplier = coalesce(p_row->'supplier', supplier),
    images = coalesce(p_row->'images', images),
    expiry_date = coalesce((p_row->>'expiry_date')::timestamptz, (p_row->>'expiryDate')::timestamptz, expiry_date),
    updated_at = now(),
    version = p_current_version + 1,
    size_kind = coalesce(lower(nullif(trim(p_row->>'size_kind'), '')), lower(nullif(trim(p_row->>'sizeKind'), '')), size_kind)
  WHERE id = p_id AND version = p_current_version;

  GET DIAGNOSTICS v_updated = row_count;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Product was updated by someone else. Please refresh and try again.';
  END IF;

  IF p_quantity_by_size IS NOT NULL THEN
    IF jsonb_array_length(p_quantity_by_size) > 0 THEN
      -- Payload has sizes: delete ONLY size_codes not in payload (explicit removals)
      -- Same normalization as insert loop: empty/blank -> 'NA'
      SELECT array_agg(DISTINCT code) INTO v_payload_codes
      FROM (
        SELECT CASE
          WHEN nullif(trim(replace(e->>'sizeCode', ' ', '')), '') IS NULL THEN 'NA'
          ELSE upper(nullif(trim(replace(e->>'sizeCode', ' ', '')), ''))
        END AS code
        FROM jsonb_array_elements(p_quantity_by_size) e
      ) sub;
      IF v_payload_codes IS NOT NULL AND array_length(v_payload_codes, 1) > 0 THEN
        DELETE FROM warehouse_inventory_by_size
        WHERE warehouse_id = p_warehouse_id AND product_id = p_id
          AND size_code != ALL(v_payload_codes);
      END IF;
      -- UPSERT each payload size (never wipe all then insert)
      v_qty := 0;
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_quantity_by_size)
      LOOP
        v_size_code := upper(nullif(trim(replace(v_entry->>'sizeCode', ' ', '')), ''));
        IF v_size_code IS NULL OR v_size_code = '' THEN v_size_code := 'NA'; END IF;
        v_size_qty := greatest(0, floor((v_entry->>'quantity')::numeric));
        v_qty := v_qty + v_size_qty;
        INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
        VALUES (p_warehouse_id, p_id, v_size_code, v_size_qty, now())
        ON CONFLICT (warehouse_id, product_id, size_code)
        DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at;
      END LOOP;
    ELSE
      -- Empty array: user explicitly cleared all sizes
      DELETE FROM warehouse_inventory_by_size WHERE warehouse_id = p_warehouse_id AND product_id = p_id;
      v_qty := greatest(0, coalesce(p_quantity, 0));
    END IF;
    -- Sync warehouse_inventory.quantity from by_size sum (single source of truth)
    INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    VALUES (p_warehouse_id, p_id, greatest(0, v_qty), now())
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at;
  ELSIF p_quantity IS NOT NULL THEN
    INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    VALUES (p_warehouse_id, p_id, greatest(0, p_quantity), now())
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at;
  END IF;

  RETURN (SELECT to_jsonb(wp) FROM warehouse_products wp WHERE wp.id = p_id);
END;
$$;

COMMENT ON FUNCTION update_warehouse_product_atomic(uuid, uuid, jsonb, int, int, jsonb) IS
  'Atomic update: product (version check) + inventory. By-size: UPSERT payload sizes, delete only explicitly removed; prevents vanishing sizes.';
