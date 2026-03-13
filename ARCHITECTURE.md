# Warehouse POS — Architecture

A practical overview for developers who need to understand, maintain, and extend this system.

---

## 1. SYSTEM OVERVIEW

### What the system does

- **Multi-warehouse inventory + POS**: Product catalog, per-warehouse stock (including per-size), sales recording with stock deduction, deliveries, sales history, and reporting.
- **Scoped access**: Users are tied to warehouses (and optionally stores) via `user_scopes`; the API enforces warehouse scope on all product, sales, and dashboard requests.

### Tech stack

| Layer        | Technology |
|-------------|------------|
| **Client**  | React, Vite, React Query, React Router |
| **API**     | Next.js (App Router) in `inventory-server/` |
| **Database**| Supabase (PostgreSQL) |
| **Cache**   | Upstash Redis (optional; products list + dashboard stats) |
| **Hosting** | Vercel (frontend SPA + API as separate or subpath project) |

### Two main parts

- **`inventory-server/`** — Next.js app: API routes, auth, server-side data access, Redis cache. This is the backend.
- **`src/`** — React SPA: UI, contexts, pages (Inventory, POS, Sales, Deliveries, Dashboard, etc.). Calls `API_BASE_URL` for all data.

---

## 2. DATABASE LAYER (Supabase)

### Tables and what each stores

| Table | Purpose |
|-------|--------|
| **warehouse_products** | Product master: id, sku, barcode, name, category, size_kind (na \| one_size \| sized), prices, reorder_level, location, supplier, images, etc. One row per product (no warehouse_id). |
| **warehouse_inventory** | Quantity per (warehouse_id, product_id). Single row per product per warehouse; used for POS total and for non-sized/one-size products. |
| **warehouse_inventory_by_size** | Quantity per (warehouse_id, product_id, size_code). Used when product has size_kind = 'sized'. size_code references size_codes. |
| **warehouses** | Warehouse/location entity: id, name, code. All inventory and sales are scoped to a warehouse. |
| **sales** | Sale header: warehouse_id, receipt_id, payment_method, subtotal, discount, total, status, delivery_schedule, delivery_status, sold_by_email, created_at, etc. |
| **sale_lines** | Line items: sale_id, product_id, size_code, qty, unit_price, line_total, product_name, product_sku, etc. |
| **sale_reservations** | Reservations for delivery sales (referenced by sales; truncated in clear_sales_history before sale_lines and sales). |
| **size_codes** | Reference: size_code (PK), size_label, size_order. Used to validate and display sizes (e.g. US9, M, EU42). |
| **user_scopes** | user_email, warehouse_id, store_id, pos_id. Defines which warehouses/stores a user can access. |
| **stores** | Optional store entity; warehouses can be linked via store_id. |

Other supporting tables: transactions, stock_movements, orders (and related), sync_rejections, durability_log; see migrations for full schema.

### Active triggers on `warehouse_inventory_by_size`

After simplification (migration `20260312000000_simplify_wibs_triggers.sql`), there is a single trigger:

| Trigger | When | What it does |
|---------|------|--------------|
| **trg_normalize_size_code** | BEFORE INSERT OR UPDATE | Uppercases and trims `size_code` so values are stored consistently. |

Previously there were multiple triggers (enforce size policy, enforce size rules, enforce size kind); they were replaced by this single normalizer. Data integrity between `warehouse_inventory` and `warehouse_inventory_by_size` is also maintained by triggers on **warehouse_inventory** (e.g. sync from by_size, backfill by_size when empty) and by RPCs that update both; see `docs/DATA_INTEGRITY_PRODUCT_DRIFT.md`.

### RPCs (Stored Procedures)

| RPC | Purpose |
|-----|--------|
| **record_sale** | Atomically: insert into sales + sale_lines, deduct from warehouse_inventory (non-sized) or warehouse_inventory_by_size (sized), sync warehouse_inventory for sized products. Returns { id, receiptId, createdAt, ... }. Called by POST /api/sales. |
| **void_sale** (p_sale_id) | Restore stock from sale_lines into warehouse_inventory / warehouse_inventory_by_size, set sales.status = 'voided'. Idempotent if already voided. Called by PATCH /api/sales (action: void). |
| **complete_delivery** (p_sale_id) | Mark delivery as completed; deduct reserved stock (sale_reservations) and update delivery_status. Called by PATCH /api/sales when deliveryStatus = 'delivered'. |
| **release_delivery_reservations** (p_sale_id) | Release reservations for a cancelled delivery; update delivery_status. Called by PATCH /api/sales when deliveryStatus = 'cancelled'. |
| **receive_delivery** (p_warehouse_id, p_received_by, p_items) | Add inbound stock: upsert into warehouse_inventory_by_size for each item (product_id, size_code, quantity). Trigger syncs warehouse_inventory. |
| **clear_sales_history** | Admin-only: truncate sale_reservations, sale_lines, sales (in that order); reset receipt_seq. Called by POST /api/admin/clear-sales-history. |
| **get_warehouse_inventory_stats** (p_warehouse_id) | Returns one row: total_stock_value, total_products, total_units, low_stock_count, out_of_stock_count. Used by dashboard. |
| **get_sales_report** (p_warehouse_id, p_from, p_to) | Returns report data for GET /api/reports/sales. |
| **get_today_sales_by_warehouse** (p_date) | Returns today’s sales revenue per warehouse for admin panel. |

### Relationship between `warehouse_inventory` and `warehouse_inventory_by_size`

- **warehouse_inventory**: One row per (warehouse_id, product_id); holds **total** quantity for that product in that warehouse. Used for POS and for products without sizes (size_kind na or one_size).
- **warehouse_inventory_by_size**: One row per (warehouse_id, product_id, size_code). Used when size_kind = 'sized'; each size has its own quantity.
- **Sync rule**: For sized products, total quantity should equal sum(quantity) over warehouse_inventory_by_size for that (warehouse_id, product_id). record_sale and product update flows keep them in sync; triggers (sync from by_size, backfill by_size when inv-only) and a nightly pg_cron job reconcile drift. The API and UI use: if product is sized and has by_size rows, use sum(by_size); else use warehouse_inventory.quantity.

---

## 3. API LAYER (inventory-server)

### API routes and purpose

| Method | Path | Purpose |
|--------|------|--------|
| **GET** | /api/products | List products for a warehouse (paginated). Query: warehouse_id, limit, offset, q, category, low_stock, out_of_stock, view=list \| default. Optional Redis cache (skipped for view=list). |
| **GET** | /api/products?id=... | Single product by id for the given warehouse_id (with quantity and quantityBySize). |
| **POST** | /api/products | Create product (admin). Body: product fields + warehouseId; creates warehouse_inventory and optionally warehouse_inventory_by_size rows. |
| **GET** | /api/products/[...id] | Get one product by id (path). |
| **PUT/PATCH** | /api/products/[...id] | Update product (admin). Direct table updates to warehouse_products, warehouse_inventory, warehouse_inventory_by_size; invalidates Redis cache. |
| **DELETE** | /api/products/[...id] | Delete product (admin). |
| **POST** | /api/products/verify-stock | Verify stock for line items before completing a sale (e.g. POS). |
| **GET** | /api/sales | List sales for warehouse_id; query: pending, from, to, limit. |
| **POST** | /api/sales | Record sale: calls record_sale RPC (insert sale + lines, deduct stock). Body: warehouseId, lines[], paymentMethod, subtotal, total, etc. |
| **PATCH** | /api/sales | Update sale: void (void_sale), or set delivery status (complete_delivery / release_delivery_reservations / dispatched). Body: saleId, action \| deliveryStatus. |
| **POST** | /api/sales/void | Void a sale by id. |
| **GET** | /api/warehouses | List warehouses (auth required). |
| **GET** | /api/warehouses/[id] | Single warehouse by id. |
| **GET** | /api/dashboard | Dashboard stats for warehouse_id and date: totals, low stock, today sales, category summary. Uses get_warehouse_inventory_stats / view; Redis cache for today. |
| **GET** | /api/dashboard/today-by-warehouse | Today’s sales per warehouse (admin). |
| **GET** | /api/size-codes | List size codes (for dropdowns). |
| **GET** | /api/stores | List stores. |
| **GET** | /api/stores/[id] | Single store. |
| **GET** | /api/transactions | List transactions for warehouse (from/to, limit). |
| **GET** | /api/stock-movements | Stock movements for warehouse. |
| **GET** | /api/reports/sales | Sales report via get_sales_report RPC. |
| **GET** | /api/user-scopes | User scopes (for current user / admin). |
| **POST** | /api/admin/clear-sales-history | Admin: clear sales/delivery history (calls clear_sales_history RPC; requires confirmation body). |
| **GET/POST** | /api/auth/login | Login (session JWT + cookie). |
| **GET** | /api/auth/user | Current user from session. |
| **POST** | /api/auth/logout | Logout (clear cookie). |
| **GET** | /api/health, /api/health/ready | Health check. |
| **POST** | /api/upload/product-image | Upload product image (storage). |
| **Orders, inventory/deduct, orders/deduct, orders/return-stock, orders/[id]/cancel** | Order and inventory-deduction endpoints (see app/api under orders and inventory). |
| **Sync-rejections, sync API** | See app/api/sync-rejections and related. |

### Caching strategy (Redis)

- **Products list** (`lib/cache/productsCache.ts`): Key pattern `products:wh:{warehouseId}*` (includes limit, offset, q, category, low_stock, out_of_stock). TTL 5 minutes. **List view (view=list) is never cached** so quantityBySize is always fresh and ONE_SIZE doesn’t appear from stale cache.
- **Invalidation**: After any product create/update/delete, `notifyProductsUpdated(warehouseId)` scans and deletes all keys matching `products:wh:{warehouseId}*`. Dashboard: `notifyInventoryUpdated(warehouseId)` deletes `warehouse_stats:{warehouseId}`. Called from product route and after sale/inventory changes where implemented.
- **Dashboard stats** (`lib/cache/dashboardStatsCache.ts`): Key `warehouse_stats:{warehouseId}`, TTL 30s. Used only for “today”; other dates are uncached. Low-stock items are recomputed on each request even when serving cached totals so alerts stay accurate.
- **Fail-safe**: If Redis env (UPSTASH_REDIS_REST_URL/TOKEN) is missing or a call fails, the API falls back to DB and does not fail the request.

### Auth (requireAuth, getScopeForUser, warehouse scoping)

- **requireAuth(req)**: Validates Bearer JWT or session cookie; returns session (email, role, warehouse_id, etc.) or a 401 NextResponse. Used by almost all API routes.
- **getScopeForUser(email)**: Reads `user_scopes` (or env ALLOWED_WAREHOUSE_IDS fallback) and returns allowedWarehouseIds, allowedStoreIds. Cached in-memory per email for a short period to keep product fetch fast.
- **Warehouse scoping**: For list/dashboard/sales, the effective warehouse is: (1) query param warehouse_id if in scope or user is admin with no scope, or (2) first allowed warehouse. If user has a single warehouse in user_scopes, that can be bound to the session so POS doesn’t need a location selector.
- **requireAdmin(req)**: Same as requireAuth but returns 403 if role is not admin/super_admin. Used for product write, clear-sales-history, etc.
- **getEffectiveWarehouseId(auth, warehouseId)**: Returns warehouseId if it’s in the user’s scope (or admin with no scope); otherwise null. Used to enforce access on POST /api/sales and product updates.

---

## 4. CLIENT LAYER (src/)

### Key contexts

| Context | Role |
|---------|------|
| **AuthContext** | Login/logout, session, user (email, role, warehouseId), permissions, tryRefreshSession. Wraps the app so all routes have auth state. |
| **WarehouseContext** | Current warehouse (currentWarehouseId), list of warehouses, setCurrentWarehouseId. Single source of truth so Dashboard, Inventory, POS all use the same warehouse; persists to localStorage. |
| **InventoryContext** | Products for current warehouse: fetch from API, normalize with normalizeProductRow, React Query cache, loadMore, mutations (create/update/delete), offline support when enabled. Exposes products, loading, error, and mutation helpers. |
| **POSContext** | Cart state, add/remove/update line items, totals, and submission to POST /api/sales. |
| **StoreContext** | Current store and store list (for multi-store). |
| **OrderContext** | Orders and order-related actions. |
| **RealtimeContext** | Optional Supabase Realtime for live product/inventory updates. |

Navigation is defined once in `src/config/navigation.tsx` and imported by Sidebar and MobileMenu to avoid desktop/mobile nav drift (see ENGINEERING_RULES §8).

### Key pages

| Route | Page | Purpose |
|-------|------|--------|
| / | Dashboard | Stats (total value, units, low stock, today sales), category summary, low-stock alerts. |
| /inventory | Inventory | Product list (grid/list), search, filters, add/edit/delete product; uses InventoryContext and currentWarehouseId. |
| /pos | POS | Cart, product search, size selection, payment method, POST /api/sales; uses WarehouseContext and POSContext. |
| /sales | SalesHistory | List sales, filters, void, delivery status (PATCH /api/sales). |
| /deliveries | Deliveries | Delivery queue, receive delivery, status updates. |
| /orders | Orders | Order list and actions. |
| /reports | Reports | Sales and other reports. |
| /users, /settings | Users, Settings | User and app settings. |

### How products flow (API → UI)

1. **API** returns rows from warehouse_products joined with warehouse_inventory and warehouse_inventory_by_size (or from getWarehouseProducts which aggregates by_size in batches of 100).
2. **normalizeProductRow** (in InventoryContext) maps API shape to **Product**: quantityBySize from quantity_by_size, camelCase, numbers, dates. Same idea used in POS with normalizeProductItem.
3. **React Query** caches by queryKey (e.g. products(warehouseId)); list and single-product reads use this cache; mutations invalidate or update the cache.
4. **UI** (Inventory, POS) reads from context/query cache; list view always skips Redis so it gets fresh quantityBySize from the API.

### How a sale flows (POS → record_sale → UI)

1. **POS**: User adds items to cart (product + size + qty). Cart is in POSContext.
2. **Submit**: Client calls **POST /api/sales** with warehouseId, lines (productId, sizeCode, qty, unitPrice, …), paymentMethod, total.
3. **API**: requireAuth + getEffectiveWarehouseId; then **db.rpc('record_sale', …)**. RPC inserts sales + sale_lines and deducts from warehouse_inventory or warehouse_inventory_by_size (and syncs inv for sized).
4. **Response**: Success returns { id, receiptId, status, createdAt, … }; 422 if insufficient stock.
5. **Client**: On success, cart is cleared and success/receipt UI shown. Optimistic UI update after sale (e.g. product quantities in POS cache) is a known area for improvement (see §7).

---

## 5. KNOWN ARCHITECTURE DECISIONS

- **Direct table writes for product updates**: Product create/update use direct Supabase client writes to warehouse_products, warehouse_inventory, and warehouse_inventory_by_size (no RPC). This keeps the update path simple and allows fine-grained validation and version check (optimistic lock) in the API; RPCs are reserved for atomic multi-table operations like record_sale and void_sale.
- **By_size fetched in batches of 100**: getWarehouseProducts fetches warehouse_inventory_by_size for the current page’s product IDs in chunks of 100 (BATCH = 100 in warehouseProducts.ts) to stay under PostgREST/Supabase row limits and avoid timeouts on large catalogs.
- **List view skips Redis**: The products list endpoint does not cache when view=list so that quantityBySize is always from the DB and the list never shows stale “One size” or wrong quantities from a cached payload.
- **Triggers simplified to single normalizer**: All previous “enforce” triggers on warehouse_inventory_by_size were replaced by one BEFORE trigger that only normalizes size_code (uppercase, trim). Size validation is done in the API against size_codes; complex business rules live in RPCs and application code.

---

## 6. HOW TO EXTEND THE SYSTEM

### Adding a new warehouse

1. Insert a row into **warehouses** (name, code). Optionally link to a store via store_id.
2. Ensure **user_scopes** has entries for users who should access the new warehouse (user_email, warehouse_id).
3. No code change required for listing or scoping; the API uses warehouse_id and user_scopes.

### Adding a new size category

1. Insert into **size_codes** (size_code, size_label, size_order). size_code is the value stored in warehouse_inventory_by_size.
2. Client size dropdowns typically load from GET /api/size-codes; no frontend change if the dropdown is driven by that API.

### Adding a new API endpoint

1. Create a route under **inventory-server/app/api/** (e.g. app/api/my-feature/route.ts).
2. Use **requireAuth** (and **getScopeForUser** / **getEffectiveWarehouseId** if warehouse-scoped). Call getSupabase() for DB access.
3. Invalidate Redis if the endpoint changes product or inventory data: **notifyProductsUpdated(warehouseId)** and/or **notifyInventoryUpdated(warehouseId)**.
4. Document the route in this file or in a dedicated API doc.

### Adding a new page/feature to the client

1. Add the route and page component under **src/** (e.g. src/pages/MyPage.tsx).
2. Add the nav item to **src/config/navigation.tsx** (so both Sidebar and MobileMenu get it); optionally guard with permission.
3. Use **useWarehouse()** for warehouse-scoped data and **useAuth()** for permissions; call existing APIs or new ones as above.

---

## 7. CURRENT KNOWN ISSUES AND NEXT STEPS

- **Cancel delivery restore logic**: When a delivery is cancelled (PATCH /api/sales, deliveryStatus = 'cancelled'), release_delivery_reservations is called. Confirm that reserved stock is fully restored and visible in inventory and that edge cases (partial cancel, double cancel) are handled.
- **Draft/pending sale preserve logic**: Preserving draft or pending sales across refresh or navigation is not fully documented or implemented; may require client persistence (e.g. localStorage) and/or a backend “draft” state.
- **POS optimistic update after sale**: After a successful sale, the POS product list (or React Query cache) is not always updated immediately to reflect new quantities; user may need to refresh or switch warehouse to see correct stock. Consider invalidating products query or updating cache on successful POST /api/sales for the current warehouse.

For data integrity (drift between warehouse_inventory and warehouse_inventory_by_size), see **docs/DATA_INTEGRITY_PRODUCT_DRIFT.md**. For deployment and env, see **docs/ENGINEERING_RULES.md** and **docs/DEPLOY_AND_STOCK_VERIFY.md**.

---

## 8. DEBUGGING LESSONS LEARNED

### The Supabase 1000-row limit

Supabase/PostgREST silently caps `.in()` query results at 1000 rows regardless of `.limit()` calls on the query itself. With 250+ products each having multiple sizes, warehouse_inventory_by_size queries were truncated, causing products beyond the first ~150 to fall back to ONE_SIZE. **Fix:** fetch in batches of 100 using a loop (fetchAllSizeRows in warehouseProducts.ts).

### is_hardened_context() does not work from Next.js

The DB function `is_hardened_context()` checks `current_setting('request.jwt.claim.role') = 'service_role'`. This GUC is only set automatically in Supabase Edge Functions. When calling from Next.js API routes (even with the service role key), this setting is never populated, so `is_hardened_context()` always returns false. This caused all BEFORE triggers to run in strict mode, silently blocking UPDATE operations on warehouse_inventory_by_size and preventing inventory deduction. **Fix:** remove all validation triggers; keep only the single normalizer (trg_normalize_size_code).

### Redis cache was masking the real data

The products list was cached in Redis for 5 minutes. Even after fixing the DB write path, the UI kept showing stale ONE_SIZE data from the cache. **Fix:** skip Redis entirely for view=list requests. Always read fresh from DB for the inventory list.

### Two versions of record_sale RPC

At one point two versions of record_sale existed in the DB with different signatures (one with p_customer_email, one with p_delivery_schedule). Supabase resolved the call by matching parameters, but this caused unpredictable behavior. Always drop old function versions when replacing RPCs.

### Warehouse ID mismatch between reads and writes

Products are stored in warehouse_products without a warehouse_id (one row per product). Inventory is per-warehouse in warehouse_inventory and warehouse_inventory_by_size. If the client uses a different warehouse_id for reads vs writes, sizes appear missing even though the data exists. Always verify currentWarehouseId is consistent across all API calls in the same session.

### React Query cache race condition

After saving a product, the code had a setTimeout that refetched the product list after 500–2000ms. This caused a race where the refetch returned stale data and overwrote the correct optimistic update. **Fix:** remove the delayed refetch entirely. Use only invalidateQueries immediately after save and let React Query refetch naturally.
