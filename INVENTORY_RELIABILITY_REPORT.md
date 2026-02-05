# Inventory Reliability Report (P0 incident)

See also: `src/lib/INVENTORY_FLOW_AND_AUTHORITY.md` for flow diagram and authoritative data store.

## Root cause

1. **Fake persistence**  
   When the products API failed (network, 4xx/5xx), `addProduct` saved only to client state + localStorage + IndexedDB and threw `ADD_PRODUCT_SAVED_LOCALLY`. The UI showed a warning toast, but users could still assume data was "saved". On another device (no localStorage), that data did not exist — inventory appeared to save but later vanished.

2. **No read-after-write**  
   A successful API response was trusted without re-fetching. If the backend returned 200 but did not actually persist (bug, replica lag, wrong DB), the client would show "Saved" and the record could be missing on the next device.

3. **Env/default risk**  
   `API_BASE_URL` fell back to a default in production. If warehouse and storefront used different backends or envs, they would read/write different data — desync and "no inventory on other device".

4. **Swallowed errors**  
   Some catch blocks (e.g. `saveProductsToDb(...).catch(() => {})`) hid failures. Cache writes are best-effort but should be logged so persistence issues are visible.

## Fixes applied

- **Build fails if env is missing**  
  Production build requires `VITE_API_BASE_URL` (Vite plugin + runtime check in `api.ts`). No default in production.

- **Read-after-write verification**  
  After every successful `addProduct` and `updateProduct`, the client re-fetches the product list and verifies the saved record is present. If not, we throw and do not show "Saved".

- **Idempotency**  
  `addProduct` sends a stable `Idempotency-Key` (new product id) on POST to avoid duplicate creates on retry.

- **Version / 409**  
  `updateProduct` already sends `version` and handles 409; we kept that and run read-after-write after success.

- **Structured logging**  
  `inventoryLogger` logs `inventory.create`, `inventory.update`, `inventory.read`, `inventory.error` with requestId, productId, sku, listLength, environment. Errors are reported via `reportError` for Sentry/etc.

- **No silent swallow**  
  Replaced `saveProductsToDb(...).catch(() => {})` with `.catch(e => reportError(...))` so cache write failures are visible.

- **Disaster test**  
  Integration test: when API returns 200 but read-back does not include the product, `addProduct` throws. When read-back includes the product, `addProduct` resolves (device B sees inventory in one request).

- **CI invariants**  
  `scripts/ci-inventory-invariants.mjs` and `npm run ci` check env and run tests + build.

## Remaining risks — eliminated

- **Backend out of repo** — **Addressed.**  
  An in-repo backend is provided: `inventory-server` (Next.js) with API routes `/api/products`, `/admin/api/products`, and bulk delete. Data layer: `lib/data/warehouseProducts.ts` writing to Supabase table `warehouse_products`. Warehouse UI and storefront can both point `VITE_API_BASE_URL` to this server for a single source of truth in this repo.

- **Local-only path** — **Hardened.**  
  We now track `localOnlyIds` and expose `unsyncedCount`. The UI shows a prominent banner when `unsyncedCount > 0` (“N items only on this device”) with a “Sync to server now” button. Background sync runs every 2 minutes when there are unsynced items and the tab is visible. After a successful sync, synced ids are removed from `localOnlyIds`. No silent “saved” for server; local-only is always visible until synced.

- **Delete path** — **Addressed.**  
  Delete now uses read-after-delete verification: after a successful DELETE (single or bulk), the client re-fetches the product list and verifies the deleted id(s) are no longer present. If any deleted id still appears, we throw and do not remove from local state. `logInventoryDelete` is called on successful verified delete.

---

## What needs to be done

### 1. Create the warehouse_products table in Supabase

Run the migration so the in-repo backend can persist inventory:

- **Option A (Supabase dashboard):**  
  Open your project → SQL Editor → run the contents of  
  `inventory-server/supabase/migrations/20250204000000_create_warehouse_products.sql`.

- **Option B (Supabase CLI):**  
  From `inventory-server/`, run `supabase db push` (or your usual migration command) so the migration is applied.

### 2. Configure environment variables

- **inventory-server** (when using the in-repo backend):  
  Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (or your deployment env). No defaults; the app throws if these are missing.

- **Warehouse UI (Vite):**  
  Set `VITE_API_BASE_URL` in `.env.production` (and in CI) to the URL of the app that serves the products API.  
  - If you use the in-repo backend: point this to your deployed `inventory-server` origin (e.g. `https://api.extremedeptkidz.com` or the same host as the storefront if you serve both from one app).  
  - Production build fails if `VITE_API_BASE_URL` is unset.

### 3. Deploy and point both domains to the same backend

- Deploy `inventory-server` (or the app that hosts these API routes) so it is reachable at the URL you set in `VITE_API_BASE_URL`.
- Ensure **warehouse.extremedeptkidz.com** and **extremedeptkidz.com** (or your storefront) both use the same `VITE_API_BASE_URL` / same backend. One backend, one DB (e.g. one Supabase project and one `warehouse_products` table) = single source of truth and no cross-device desync.

### 4. CI / production checklist

- Run `npm run ci` before release (invariants + tests + build).
- In CI, set `VITE_API_BASE_URL` (and optionally `CI=1`) so the invariant script and production build use the correct API base.
- After deployment, smoke-test: add a product on one device, open the app on another; the product should appear after one load (read-after-write and same backend guarantee this when the backend is in-repo and configured as above).
