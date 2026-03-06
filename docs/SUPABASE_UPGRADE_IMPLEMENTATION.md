# Supabase Upgrade Implementation Summary

This document summarizes the six upgrades implemented from the Claude prompt: **audit and implement Supabase upgrades in order**.

---

## 1. Database trigger: sync `warehouse_inventory` from `warehouse_inventory_by_size`

**Migration:** `inventory-server/supabase/migrations/20260305240000_sync_warehouse_inventory_from_by_size_trigger.sql`

- **Function:** `sync_warehouse_inventory_from_by_size()` — on every INSERT/UPDATE/DELETE on `warehouse_inventory_by_size`, recomputes the total quantity for that `(warehouse_id, product_id)` and upserts `warehouse_inventory.quantity`.
- **Trigger:** `trigger_sync_warehouse_inventory_from_by_size` on table `warehouse_inventory_by_size`.
- **Effect:** Eliminates drift between size-level and total inventory at the database level; no application code required.

---

## 2. View: `warehouse_dashboard_stats` + dashboard API

**Migration:** `inventory-server/supabase/migrations/20260305250000_warehouse_dashboard_stats_view.sql`

- **View:** One row per warehouse with `total_products`, `total_units`, `total_stock_value`, `stock_value_at_cost`, `out_of_stock_count`, `low_stock_count`.
- **API:** `lib/data/dashboardStats.ts` now prefers reading from the view (`getWarehouseStatsFromView`), with fallback to the existing RPC then product sample.

---

## 3. Realtime: publication + existing hook

**Migration:** `inventory-server/supabase/migrations/20260305260000_realtime_publication_tables.sql`

- **Tables added to `supabase_realtime` publication:** `warehouse_inventory_by_size`, `sales`, `warehouse_products`, `warehouse_inventory` (idempotent).
- **Hook:** `useInventoryRealtime` was already implemented; no code change. If the migration cannot alter the publication (e.g. hosted Supabase), enable these tables in **Dashboard → Database → Replication**.

---

## 4. Storage: product-images bucket + upload + transforms

**Migration:** `inventory-server/supabase/migrations/20260305270000_storage_product_images_rls.sql`

- **RLS policies** on `storage.objects` for bucket `product-images`: public SELECT; authenticated INSERT/UPDATE/DELETE.
- **One-time step:** Create the bucket in **Supabase Dashboard → Storage → New bucket**, name: `product-images`, **public**.
- **Frontend:** `ProductFormModal` now tries `uploadProductImage()` (Supabase Storage) first, then the upload API, then base64. `getProductImageDisplayUrl(src, options)` in `lib/imageUpload.ts` returns the Storage render URL with optional `width`, `height`, `quality`, `resize` for thumbnails (e.g. POS cart uses 80×80).

---

## 5. RPC: `receive_delivery` (atomic inbound stock receive)

**Migration:** `inventory-server/supabase/migrations/20260305280000_receive_delivery_rpc.sql`

- **Signature:** `receive_delivery(p_warehouse_id uuid, p_received_by uuid, p_items jsonb)`.
- **Behavior:** For each item in `p_items` (`{ "product_id", "size_code", "quantity" }`), upserts `warehouse_inventory_by_size` (adds quantity). The trigger from step 1 keeps `warehouse_inventory` in sync.
- **Use:** Call from a future POST `/api/deliveries/receive` or similar when receiving inbound stock.

---

## 6. pg_cron: nightly stock reconciliation at 2:00 UTC

**Migration:** `inventory-server/supabase/migrations/20260305290000_pg_cron_nightly_reconcile.sql`

- **Job name:** `reconcile-warehouse-inventory-nightly`.
- **Schedule:** `0 2 * * *` (daily at 2:00 AM UTC).
- **Action:** Updates `warehouse_inventory.quantity` from `SUM(warehouse_inventory_by_size.quantity)` where they differ (safety net).
- **One-time step:** Enable **pg_cron** in **Supabase Dashboard → Database → Extensions** if the migration fails.

---

## Checklist for deploy

- [ ] Run migrations in order (or apply via Supabase CLI / Dashboard).
- [ ] Create Storage bucket `product-images` (public) in Dashboard if not present.
- [ ] If Realtime does not work, add the four tables to the `supabase_realtime` publication in Dashboard.
- [ ] If pg_cron migration fails, enable the pg_cron extension in Dashboard and re-run.

---

## Repo discipline

All app code and migrations live under `warehouse-pos/`. After pulling these changes, from `warehouse-pos/` run:

- `git status`
- `git add` / `git commit` / `git push origin main`
- Optionally: `npm run guard:uncommitted` to ensure nothing is left uncommitted.
