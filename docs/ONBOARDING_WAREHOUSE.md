# Onboarding a new warehouse (runbook)

**Purpose:** Repeatable steps to add a new client/location so the app and API work for that warehouse. Use this before handing off to a new deployment.

---

## Prerequisites

- Supabase project is set up; migrations applied (including `warehouses`, `user_scopes`, `sales`, `warehouse_products`, `warehouse_inventory`, `record_sale`, `receipt_seq`, performance indexes).
- You have Supabase Dashboard access (or SQL access) and API env (e.g. Vercel) for the backend.

---

## Step 1: Create the warehouse row

In Supabase SQL Editor (or your migration):

```sql
INSERT INTO warehouses (id, name, code, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Your Warehouse Name',   -- e.g. 'Main Town', 'Store B'
  'CODE',                  -- short code, e.g. 'MT', 'SB'
  now(),
  now()
)
RETURNING id, name, code;
```

Note the returned `id` (UUID). You will use it for user scopes and for `warehouse_id` in API calls.

---

## Step 2: Seed size codes (if needed)

If products at this warehouse use **sized** inventory and you use a shared `size_codes` table, ensure size codes exist. If you already ran a seed migration (e.g. `20260301000000_seed_size_codes_big_brand_full_catalog.sql`), you may be done. Otherwise, add sizes for this brand/catalog in a migration or one-off script so that `warehouse_inventory_by_size` and product size pickers have valid `size_code` values.

---

## Step 3: Grant users access (user_scopes)

For each cashier or manager who should see this warehouse:

```sql
INSERT INTO user_scopes (user_email, warehouse_id)
VALUES (
  'cashier@example.com',   -- lowercase email (API compares trimmed lowercase)
  '<warehouse-uuid-from-step-1>'
);
```

- **One warehouse per user:** If a user has exactly one row in `user_scopes`, the app will bind them to that warehouse (e.g. POS skips location picker).
- **Multiple warehouses:** Add one row per (user_email, warehouse_id). Admins often have no rows (unrestricted) or many rows.

---

## Step 4: Environment fallback (optional)

If `user_scopes` is empty or not used, the API falls back to `ALLOWED_WAREHOUSE_IDS` (comma-separated UUIDs) in the backend env. Prefer `user_scopes` for per-user assignment; use the env fallback only for a single-warehouse deployment where all users share the same list.

---

## Step 5: Verify

1. **API:** `GET /api/warehouses` (with auth) should include the new warehouse.
2. **App:** Log in as a user that has this warehouse in `user_scopes`. Open Inventory or POS; select or land on the new warehouse. Create or edit a product for that warehouse and confirm it appears.
3. **POS:** As a cashier scoped to this warehouse, complete a test sale and confirm `GET /api/sales?warehouse_id=<uuid>` shows it.

---

## Checklist

- [ ] Warehouse row inserted; UUID noted.
- [ ] Size codes present if using sized products.
- [ ] `user_scopes` rows added for cashiers/managers.
- [ ] `GET /api/warehouses` returns the new warehouse.
- [ ] Test sale recorded and visible in sales list.

---

## Adding products

Products are stored in `warehouse_products`; inventory per warehouse in `warehouse_inventory` and `warehouse_inventory_by_size`. Use the app (Inventory page) or API (`POST /api/products` with `warehouseId`) to add products for the new warehouse. No extra onboarding step beyond the warehouse and scopes above.
