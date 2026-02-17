# Slate Ready for Real Data

Use this checklist so the inventory/POS system is ready for **real data** and the issues fixed (image preview, delete/edit races, cross-device sync) do not recur.

---

## 1. Backend (database and API)

### 1.1 Supabase project

- Use **one** Supabase project for production. The API (`VITE_API_BASE_URL`) must point to this project’s URL and service role key.
- In **Supabase Dashboard → SQL Editor**, run **all migrations** in order. See [MIGRATIONS_TO_RUN.md](./MIGRATIONS_TO_RUN.md) for the list and paths (`inventory-server/supabase/migrations/`).

### 1.2 Warehouses

- Ensure at least one warehouse exists. The app expects a default (e.g. **Main Store**).  
- To create Main Store + stores/scopes: run **`inventory-server/supabase/scripts/seed_stores_warehouses_dc_maintown.sql`** in the SQL Editor. Safe to run more than once.

### 1.3 Seed product (optional — only for empty DB)

- **`seed_one_product.sql`** inserts a single “Sample Product” (id `00000000-0000-0000-0000-000000000101`) **only when `warehouse_products` is empty**. Use it only to unblock “no products” on first deploy.
- **For real data:** Prefer **not** running it. Add real products via the app. If you already ran it and want a clean slate, delete that row:

  ```sql
  DELETE FROM warehouse_inventory WHERE product_id = '00000000-0000-0000-0000-000000000101'::uuid;
  DELETE FROM warehouse_products WHERE id = '00000000-0000-0000-0000-000000000101'::uuid;
  ```

- The frontend treats this ID as a placeholder (skips verify to avoid 404). Once it’s gone from the DB, no special handling is needed.

### 1.4 API and env

- Deploy the **inventory-server** (or your API) so it uses the same Supabase project (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Ensure the frontend build has **`VITE_API_BASE_URL`** set to that API (e.g. `https://warehouse-pos-api-v2.vercel.app`). No trailing slash.

---

## 2. Frontend: clean client cache (optional)

If you are moving from **dev/demo** to **real data** and want to avoid old cached products or images:

**In the app:** Go to **Settings → Cache** (Local storage). Use the **"Clean cache for real data"** section: **Clear product list cache** (removes `warehouse_products` / `warehouse_products_*`), **Clear product images cache** (removes `product_images_v1`). Offline mode: **Admin dashboard** → **Clear local product data** for IndexedDB.

**Console (optional):** In the browser console on the app origin:

  ```js
  Object.keys(localStorage).filter(k => k === 'warehouse_products' || k.startsWith('warehouse_products_')).forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('product_images_v1');
  ```
  Then reload and use **Refresh list** in Inventory.

---

## 3. Verification (so issues don’t recur)

After the slate is ready, confirm:

| Check | What to do |
|-------|------------|
| **Products load** | Open Inventory; list loads from API. “Refresh list” (next to “Updated X ago”) refetches. |
| **Add product** | Add a product with an image. Save. It appears in the list and the image stays visible. |
| **Edit product** | Edit name/price/image. Save. Changes persist; image preview does not disappear during edit. |
| **Delete product** | Delete a product (admin). It disappears immediately; it does not reappear after a few seconds. |
| **Other device** | On another browser/device, open Inventory. Within ~10 s or after “Refresh list”, deletes/edits from the first device appear. |
| **Edit deleted product** | On device A delete a product; on device B have the edit modal open for that product and click Save. Modal closes, list refreshes, clear message shown. |
| **Permissions** | Delete requires **admin**. Non-admin users see: “You don’t have permission to delete products.” |

---

## 4. Roles and permissions

- **Product delete:** Only **admin** (or super_admin) can delete. Ensure at least one admin user exists and that the session role is set correctly by your auth/backend.
- **Product add/edit:** Depends on your API and RBAC; typically inventory create/update permission.

---

## 5. Quick “go live” order

1. Run all migrations on the **production** Supabase project.
2. Run **seed_stores_warehouses_dc_maintown.sql** (and any other store/warehouse scopes you need). Do **not** run `seed_one_product.sql` if you want to start with zero products and add only real ones.
3. Set **VITE_API_BASE_URL** for the frontend build and deploy.
4. (Optional) Clear product/product_images cache in the browser if moving from dev/demo (see §2).
5. Log in as admin, open Inventory, use “Refresh list” once. Add/edit/delete one product and run through the verification table above.

After this, the system is ready for real data and the recent fixes (image preview, delete race, edit-after-delete, cross-device) will behave as intended.
