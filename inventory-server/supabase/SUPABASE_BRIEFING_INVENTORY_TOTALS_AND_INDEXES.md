# Supabase briefing: inventory totals, indexes, dedupe

**Purpose:** Context for Cursor AI and downstream processes after syncing warehouse totals with per-size data and hardening constraints.

---

## What was done (deployed)

### 1. Backfilled aggregated inventory totals

- **Synced** `public.warehouse_inventory` (totals table) with the **sum** of quantities from `public.warehouse_inventory_by_size` (per-size table).
- Each `(product_id, warehouse_id)` total now reflects the sum across all sizes.
- Ensures warehouse-level totals are consistent with size-level data.

### 2. Performance indexes

Composite indexes added for faster lookups/joins:

- **`public.warehouse_inventory_by_size(warehouse_id, product_id)`**
- **`public.warehouse_inventory(warehouse_id, product_id)`**

These help both read and maintenance operations scale.

### 3. Deduplicated and enforced uniqueness

- **Detected and resolved** duplicates in `public.warehouse_inventory` on `(product_id, warehouse_id)`:
  - Merged duplicate rows by **summing** their quantities.
  - Kept a **single canonical row** per key and deleted the extras.
- **Added unique constraint** `uq_wi_product_warehouse` on `(product_id, warehouse_id)` to prevent future duplicates.

### 4. Verified size-level data (example)

- For **product_id** `b51de7ed-b52f-4c91-9939-f2e850a51f19`, size-level quantities are mostly 0, with:
  - **EU30 = 5**
  - **EU31 = 2**

---

## What this enables for Cursor AI

- **Reliable aggregation:** Warehouse-level totals can be trusted to equal the sum of sizes for that (product, warehouse).
- **Deterministic pagination/streaming:** With uniqueness and indexes in place, keyset pagination by `(warehouse_id, product_id)` or time-based columns is consistent and fast.
- **Cleaner semantics:** No ambiguous duplicate totals per (product, warehouse).

---

## Repo alignment

- **Migrations:** Use `warehouse_inventory` and `warehouse_inventory_by_size` with composite indexes and no duplicate keys; backfill scripts (e.g. sync totals from by_size) live in `supabase/scripts/` for one-time or maintenance use.
- **RPCs:** Assume `warehouse_inventory.quantity` = sum of `warehouse_inventory_by_size.quantity` for the same (warehouse_id, product_id); maintain this when writing via atomic RPCs.
