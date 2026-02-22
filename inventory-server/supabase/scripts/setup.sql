-- ============================================================
-- setup.sql
-- Run this in Supabase Dashboard → SQL Editor
-- This is IDEMPOTENT — safe to run multiple times.
-- It creates missing tables, fixes inventory sync issues,
-- and sets up the atomic RPC if not already present.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PART 1: Ensure warehouse_inventory_by_size exists
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_inventory_by_size (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  product_id   uuid NOT NULL,
  size_code    text NOT NULL,
  quantity     int  NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id, size_code)
);

CREATE INDEX IF NOT EXISTS idx_wibs_warehouse_product
  ON warehouse_inventory_by_size (warehouse_id, product_id);

-- ─────────────────────────────────────────────────────────────
-- PART 2: Ensure size_codes table exists and is populated
-- Safe when table already exists with older schema (e.g. size_order, no size_group).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS size_codes (
  size_code  text PRIMARY KEY,
  size_label text NOT NULL,
  size_group text NOT NULL DEFAULT 'general',
  sort_order int  NOT NULL DEFAULT 0
);

-- Migrate older schema: add missing columns or rename size_order → sort_order
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'size_codes' AND column_name = 'size_group'
  ) THEN
    ALTER TABLE public.size_codes ADD COLUMN size_group text NOT NULL DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'size_codes' AND column_name = 'sort_order'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'size_codes' AND column_name = 'size_order'
    ) THEN
      ALTER TABLE public.size_codes RENAME COLUMN size_order TO sort_order;
    ELSE
      ALTER TABLE public.size_codes ADD COLUMN sort_order int NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;

-- Insert standard EU shoe sizes (for kids footwear)
INSERT INTO size_codes (size_code, size_label, size_group, sort_order) VALUES
  ('EU16', 'EU 16', 'eu_kids',  1),
  ('EU17', 'EU 17', 'eu_kids',  2),
  ('EU18', 'EU 18', 'eu_kids',  3),
  ('EU19', 'EU 19', 'eu_kids',  4),
  ('EU20', 'EU 20', 'eu_kids',  5),
  ('EU21', 'EU 21', 'eu_kids',  6),
  ('EU22', 'EU 22', 'eu_kids',  7),
  ('EU23', 'EU 23', 'eu_kids',  8),
  ('EU24', 'EU 24', 'eu_kids',  9),
  ('EU25', 'EU 25', 'eu_kids', 10),
  ('EU26', 'EU 26', 'eu_kids', 11),
  ('EU27', 'EU 27', 'eu_kids', 12),
  ('EU28', 'EU 28', 'eu_kids', 13),
  ('EU29', 'EU 29', 'eu_kids', 14),
  ('EU30', 'EU 30', 'eu_kids', 15),
  ('EU31', 'EU 31', 'eu_kids', 16),
  ('EU32', 'EU 32', 'eu_kids', 17),
  ('EU33', 'EU 33', 'eu_kids', 18),
  ('EU34', 'EU 34', 'eu_kids', 19),
  ('EU35', 'EU 35', 'eu_kids', 20),
  ('EU36', 'EU 36', 'eu_kids', 21),
  ('EU37', 'EU 37', 'eu_kids', 22),
  ('EU38', 'EU 38', 'eu_kids', 23),
  ('EU39', 'EU 39', 'eu_kids', 24),
  ('EU40', 'EU 40', 'eu_kids', 25),
  ('XS',   'XS',    'apparel', 30),
  ('S',    'S',     'apparel', 31),
  ('M',    'M',     'apparel', 32),
  ('L',    'L',     'apparel', 33),
  ('XL',   'XL',    'apparel', 34),
  ('XXL',  'XXL',   'apparel', 35)
ON CONFLICT (size_code) DO UPDATE SET
  size_label = EXCLUDED.size_label,
  size_group = EXCLUDED.size_group,
  sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────
-- PART 2b: Ensure warehouse_inventory has unique (warehouse_id, product_id)
-- Required for Part 4 and the RPC ON CONFLICT; safe if constraint exists.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'warehouse_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'warehouse_inventory'
         AND c.conname = 'warehouse_inventory_warehouse_product_key'
         AND c.contype = 'u'
     ) THEN
    ALTER TABLE warehouse_inventory
    ADD CONSTRAINT warehouse_inventory_warehouse_product_key
    UNIQUE (warehouse_id, product_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- PART 3: Fix inventory sync — update warehouse_inventory total
-- to match sum of sizes for all sized products
-- ─────────────────────────────────────────────────────────────
UPDATE warehouse_inventory wi
SET
  quantity   = sub.total_qty,
  updated_at = now()
FROM (
  SELECT
    wbs.warehouse_id,
    wbs.product_id,
    SUM(wbs.quantity) AS total_qty
  FROM warehouse_inventory_by_size wbs
  GROUP BY wbs.warehouse_id, wbs.product_id
) sub
JOIN warehouse_products wp ON wp.id = sub.product_id AND wp.size_kind = 'sized'
WHERE wi.warehouse_id = sub.warehouse_id
  AND wi.product_id   = sub.product_id
  AND wi.quantity     != sub.total_qty;

-- ─────────────────────────────────────────────────────────────
-- PART 4: Create missing warehouse_inventory rows for products
-- that have no row at all (products with qty=null instead of 0)
-- ─────────────────────────────────────────────────────────────
INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
SELECT
  wp.warehouse_id,
  wp.id AS product_id,
  COALESCE((
    SELECT SUM(wbs.quantity)
    FROM warehouse_inventory_by_size wbs
    WHERE wbs.warehouse_id = wp.warehouse_id AND wbs.product_id = wp.id
  ), 0) AS quantity,
  now() AS updated_at
FROM warehouse_products wp
WHERE NOT EXISTS (
  SELECT 1
  FROM warehouse_inventory wi
  WHERE wi.warehouse_id = wp.warehouse_id AND wi.product_id = wp.id
)
ON CONFLICT (warehouse_id, product_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- PART 5: Create/replace the atomic update RPC
-- This is faster than 3 separate queries and race-condition safe.
-- The route files fall back to 3 queries if this doesn't exist,
-- but having it is recommended for production.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_warehouse_product_atomic(
  p_id               uuid,
  p_warehouse_id     uuid,
  p_row              jsonb,
  p_current_version  int,
  p_quantity         int,
  p_quantity_by_size jsonb   -- null=preserve, []=clear, [...]= replace
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_at   timestamptz := now();
  v_new_version  int;
  v_entry        jsonb;
  v_size_code    text;
  v_size_qty     int;
  v_result       jsonb;
BEGIN
  -- Optimistic lock: only update if version matches
  UPDATE warehouse_products wp
  SET
    sku           = COALESCE((p_row->>'sku')::text,           wp.sku),
    barcode       = COALESCE((p_row->>'barcode')::text,       wp.barcode),
    name          = COALESCE((p_row->>'name')::text,          wp.name),
    description   = COALESCE((p_row->>'description')::text,   wp.description),
    category      = COALESCE((p_row->>'category')::text,      wp.category),
    size_kind     = COALESCE((p_row->>'size_kind')::text,     wp.size_kind),
    selling_price = COALESCE((p_row->>'selling_price')::numeric, wp.selling_price),
    cost_price    = COALESCE((p_row->>'cost_price')::numeric, wp.cost_price),
    reorder_level = COALESCE((p_row->>'reorder_level')::int,  wp.reorder_level),
    location      = COALESCE((p_row->'location'),             wp.location),
    supplier      = COALESCE((p_row->'supplier'),             wp.supplier),
    tags          = COALESCE((p_row->'tags'),                 wp.tags),
    images        = COALESCE((p_row->'images'),               wp.images),
    version       = wp.version + 1,
    updated_at    = v_updated_at
  WHERE wp.id           = p_id
    AND wp.warehouse_id = p_warehouse_id
    AND wp.version      = p_current_version;

  GET DIAGNOSTICS v_new_version = ROW_COUNT;

  IF v_new_version = 0 THEN
    RAISE EXCEPTION 'Product was updated by someone else (version conflict). Please reload and try again.';
  END IF;

  -- Upsert inventory total
  INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
  VALUES (p_warehouse_id, p_id, p_quantity, v_updated_at)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = p_quantity, updated_at = v_updated_at;

  -- Handle per-size rows (null = preserve, [] = clear, [...] = replace)
  IF p_quantity_by_size IS NOT NULL THEN
    -- Delete all existing size rows
    DELETE FROM warehouse_inventory_by_size
    WHERE warehouse_id = p_warehouse_id AND product_id = p_id;

    -- Insert new size rows (if array is non-empty)
    IF jsonb_array_length(p_quantity_by_size) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_quantity_by_size)
      LOOP
        -- Support both camelCase (sizeCode) and snake_case (size_code)
        v_size_code := upper(trim(COALESCE(v_entry->>'sizeCode', v_entry->>'size_code', '')));
        v_size_qty  := COALESCE((v_entry->>'quantity')::int, 0);

        IF v_size_code != '' AND v_size_code != 'NA' THEN
          INSERT INTO warehouse_inventory_by_size
            (warehouse_id, product_id, size_code, quantity, updated_at)
          VALUES
            (p_warehouse_id, p_id, v_size_code, GREATEST(0, v_size_qty), v_updated_at)
          ON CONFLICT (warehouse_id, product_id, size_code)
          DO UPDATE SET quantity = GREATEST(0, v_size_qty), updated_at = v_updated_at;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Return updated product row
  SELECT to_jsonb(wp) INTO v_result
  FROM warehouse_products wp
  WHERE wp.id = p_id AND wp.warehouse_id = p_warehouse_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_warehouse_product_atomic(uuid, uuid, jsonb, int, int, jsonb)
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────
-- PART 6: Verify the fix worked
-- Run this after the above to confirm the state is correct
-- ─────────────────────────────────────────────────────────────
SELECT
  'warehouse_inventory_by_size' AS tbl,
  COUNT(*) AS rows,
  CASE WHEN COUNT(*) > 0 THEN '✅ Has data' ELSE '⚠️  Empty — save a product with sizes to populate' END AS status
FROM warehouse_inventory_by_size
UNION ALL
SELECT
  'warehouse_inventory',
  COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅ Has data' ELSE '❌ No inventory rows' END
FROM warehouse_inventory
UNION ALL
SELECT
  'size_codes',
  COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅ Has data' ELSE '❌ No size codes — sizes cannot be looked up' END
FROM size_codes
UNION ALL
SELECT
  'update_warehouse_product_atomic (RPC)',
  COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅ RPC exists' ELSE '❌ RPC missing — route uses manual fallback' END
FROM pg_proc
WHERE proname = 'update_warehouse_product_atomic';
