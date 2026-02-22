-- ============================================================
-- Create view: v_products_inventory
-- Run in Supabase Dashboard → SQL Editor.
--
-- One row per (warehouse_id, product_id) that has a warehouse_inventory row.
-- Joins warehouse_products + warehouse_inventory + per-size data so
-- getWarehouseProducts() can select('*') and get quantity + quantity_by_size.
--
-- warehouse_products has no warehouse_id; warehouse_id comes from warehouse_inventory.
-- ============================================================

-- Preserve existing view column names so CREATE OR REPLACE does not rename columns.
-- Keep warehouse_id as-is (snake_case); other columns match prior camelCase aliases.
CREATE OR REPLACE VIEW v_products_inventory AS
SELECT
  wp.id,
  wi.warehouse_id,
  wp.sku,
  wp.barcode,
  wp.name,
  wp.description,
  wp.category,
  wp.size_kind AS "sizeKind",
  wp.selling_price AS "sellingPrice",
  wp.cost_price AS "costPrice",
  wp.reorder_level AS "reorderLevel",
  wp.location,
  wp.supplier,
  wp.tags,
  wp.images,
  wp.version,
  wp.created_at AS "createdAt",
  wp.updated_at AS "updatedAt",
  wi.quantity,
  (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'size_code',  wbs.size_code,
          'size_label', COALESCE(sc.size_label, wbs.size_code),
          'quantity',   wbs.quantity
        )
        ORDER BY wbs.size_code
      ),
      '[]'::jsonb
    )
    FROM warehouse_inventory_by_size wbs
    LEFT JOIN size_codes sc ON sc.size_code = wbs.size_code
    WHERE wbs.warehouse_id = wi.warehouse_id
      AND wbs.product_id = wp.id
  ) AS "quantityBySize"
FROM warehouse_inventory wi
JOIN warehouse_products wp ON wp.id = wi.product_id;

-- Verification (run separately): use actual view column names (warehouse_id is snake_case).
-- SELECT id, warehouse_id, name, quantity, "quantityBySize" FROM v_products_inventory LIMIT 5;
