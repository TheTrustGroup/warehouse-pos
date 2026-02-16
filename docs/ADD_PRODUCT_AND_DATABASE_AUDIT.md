# Add Product & Database Communication Audit

**Scope:** Add product logic, how saving works, how data shows across devices, and how the database is used.  
**Environment:** Production at `warehouse.extremedeptkidz.com` (frontend) → backend at `VITE_API_BASE_URL`.  
**Note:** This audit is based on the codebase. Live site login was not performed (credentials not required for code audit).

---

## 1. Add Product Logic (Flow)

### 1.1 Entry point

- **UI:** User fills the form in `ProductFormModal.tsx` and submits.
- **Context:** `InventoryContext.addProduct()` is the single handler (called with product data minus `id`, `createdAt`, `updatedAt`; optional `warehouseId`).

### 1.2 Two modes (feature-flagged)

| Mode | When | Behavior |
|------|------|----------|
| **Offline-first** | `offlineEnabled === true` (feature flag) | Writes to **IndexedDB** first, then sync queue; sync to server when online. |
| **API-only** | `offlineEnabled === false` (typical production) | **Optimistic UI**: temp product with `_pending: true` → `POST` to API → on success replace temp with server response; on failure remove temp and show error. No full refetch. |

### 1.3 Validation

- **Required:** `productData.name` must be non-empty (trimmed). Thrown error: `"Product name is required"`.
- **Circuit breaker:** If server is marked unavailable, add is blocked with: `"Server is temporarily unavailable. Writes disabled until connection is restored."`

### 1.4 API-only path (typical production)

1. Generate **temp id** (e.g. `crypto.randomUUID()` or `temp-${Date.now()}-...`).
2. Build **temp product** with `_pending: true`, prepend to list (optimistic).
3. Build **payload** via `productToPayload()` (only fields the backend persists; see §2.2).
4. **POST** to backend:
   - First try: `POST /admin/api/products?warehouse_id=<effectiveWarehouseId>`
   - On failure (e.g. 403): fallback `POST /api/products?warehouse_id=...`
5. **Idempotency:** Request can send `Idempotency-Key: <tempId>` (in `apiPost` options) so retries do not create duplicates.
6. **On 201:** Response body is the created product. Client:
   - Replaces temp product in state with **normalized** server response.
   - Updates in-memory cache, `localStorage` (per warehouse), and **IndexedDB** (if available).
   - Sets `lastSyncAt`, shows “Product saved.” toast.
7. **On error:** Temp product is removed from state; error toast (e.g. “Session expired. Please log in again.” for 401).
8. **Timeout:** 10 seconds (`SAVE_TIMEOUT_MS`); no artificial delays.

### 1.5 Offline-first path (when enabled)

1. `offline.addProduct(productData)` → **IndexedDB** `inventoryDB.addProduct()`:
   - New UUID for `id`, `now()` for `createdAt`/`updatedAt`.
   - Insert into `db.products` and push `{ operation: 'CREATE', tableName: 'products', data: record }` into `db.syncQueue`.
2. UI shows “Product saved. Syncing to server when online.”
3. **Sync:** `SyncService.processSyncQueue()` runs when online; for each CREATE it calls `POST /api/products` with `buildProductPayload(data)` and uses **client id** as idempotency key so retries don’t duplicate.

---

## 2. How It Saves (Persistence)

### 2.1 Backend (source of truth)

- **Route:** `inventory-server/app/api/products/route.ts` → `POST` requires **admin** (`requireAdmin`).
- **Handler:** `createWarehouseProduct(body)` in `inventory-server/lib/data/warehouseProducts.ts`.
- **Database:** **Supabase (Postgres)**. Tables involved:
  - `warehouse_products` (product master: id, sku, barcode, name, description, category, tags, cost_price, selling_price, reorder_level, location, supplier, images, expiry_date, created_by, created_at, updated_at, version, size_kind).
  - `warehouse_inventory` (quantity per warehouse/product).
  - `warehouse_inventory_by_size` (quantity per size when `sizeKind === 'sized'`).

### 2.2 Create implementation (atomic vs legacy)

- **Preferred:** Supabase RPC `create_warehouse_product_atomic(p_id, p_warehouse_id, p_row, p_quantity, p_quantity_by_size)`:
  - Single transaction: insert into `warehouse_products`, then `warehouse_inventory`, then `warehouse_inventory_by_size` (if sized).
  - Prevents partial commits (e.g. product without inventory).
- **Fallback:** If RPC doesn’t exist (e.g. migration not applied), `createWarehouseProductLegacy` does insert + `ensureQuantity` / `setQuantitiesBySize` with best-effort rollback on failure.

### 2.3 Payload (client → server)

`productToPayload()` in `InventoryContext.tsx` sends only persisted fields, e.g.:

- `id`, `sku`, `barcode`, `name`, `description`, `category`, `tags`, `quantity`, `costPrice`, `sellingPrice`, `reorderLevel`, `location`, `supplier`, `images`, `expiryDate`, `createdBy`, `createdAt`, `updatedAt`, `version`, `sizeKind`, `quantityBySize` (when applicable).

Optional `warehouseId` is sent in the body when provided; backend uses it or `getDefaultWarehouseId()`.

### 2.4 Response and durability logging

- **Success:** API returns **201** with the full created product so the client can update UI without a follow-up GET.
- **Durability:** Backend logs success/failure via `logDurability()` (entity_type: product, entity_id, warehouse_id, request_id, user_role).

---

## 3. How It Shows Across Devices

### 3.1 Source of truth

- The **database** (Supabase) is the single source of truth. All devices see data by **reading from the API**, which reads from Supabase.

### 3.2 When does another device see a new product?

- **Immediate:** Only if that device **refetches** the list (e.g. user clicks “Refresh” or re-opens the Inventory page and a new request is made).
- **Automatic (polling):** `useRealtimeSync` in `InventoryContext` runs a **poll** when the tab is **visible**:
  - Calls `loadProducts(undefined, { silent: true, bypassCache: true })` at an **interval** (default **25 seconds** in this codebase; doc also mentions 60s in one place — the actual value is set where `useRealtimeSync` is used).
  - So another device will see the new product **within one polling interval** after it was saved, as long as that device has the Inventory tab visible.
- **Tab focus:** On `visibilitychange` to `visible`, the app runs a silent, bypass-cache refetch so when the user returns to the tab they get the latest list (including deletes from other devices).

### 3.3 No push (WebSocket)

- There is **no WebSocket or Supabase Realtime** in this flow. Updates are **pull-based** (polling + refetch on focus). Docs note that WebSocket could be added later to reduce latency and server load.

### 3.4 Caching and fallbacks (per device)

- **In-memory:** `cacheRef.current[warehouseId]` and React state.
- **localStorage:** Key `products_${warehouseId}` (or similar) for fast load on next visit.
- **IndexedDB:** When available, product list is also written for offline/cache fallback.
- After a successful add (API-only), the new product is merged into these caches and into IndexedDB so **this** device sees it immediately; **other** devices rely on polling or manual refresh.

### 3.5 Unsynced / “local only” (offline mode)

- When **offline-first** is on, products can exist only in IndexedDB until sync. `unsyncedCount` and `isUnsynced(productId)` reflect that. Once `SyncService` succeeds, they appear on the server and other devices will see them on their next poll or refresh.

---

## 4. How the Database Communicates (Architecture)

### 4.1 High-level

```
[Browser: warehouse.extremedeptkidz.com]
         │
         │  HTTPS (fetch) — auth via cookie or Bearer
         │  POST/GET/PUT/DELETE /api/products, /admin/api/products
         ▼
[Backend at VITE_API_BASE_URL (e.g. extremedeptkidz.com or separate API host)]
         │
         │  Server-side only (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
         ▼
[Supabase (Postgres)]
  - warehouse_products
  - warehouse_inventory
  - warehouse_inventory_by_size
  (+ RPCs: create_warehouse_product_atomic, update_warehouse_product_atomic)
```

- The **frontend never talks to the database directly**. All reads/writes go through your backend API.
- **API base URL** is set at **build time** via `VITE_API_BASE_URL`. Production build fails if unset (no default in prod).

### 4.2 Auth and routes

- **POST /api/products** (create): `requireAdmin(request)` — only admin users can add products.
- **GET /api/products**: `requireAuth(request)` — list filtered by `warehouse_id` query.
- Backend uses **Supabase client** with service role for DB access; auth is enforced in the Next/API layer.

### 4.3 Idempotency and retries

- Client can send **Idempotency-Key** (e.g. temp id or client-generated UUID) on POST so that retries (e.g. after timeout or network failure) do not create duplicate products. Backend would need to honor this (e.g. by storing key and returning same resource on duplicate request); implementation of idempotency on the server was not fully traced in this audit.

---

## 5. Summary Table

| Question | Answer |
|----------|--------|
| **Where is “Add product” handled?** | `InventoryContext.addProduct()`; form in `ProductFormModal.tsx`. |
| **How does it save?** | API-only: POST to `/admin/api/products` (or `/api/products`); backend calls `createWarehouseProduct` → Supabase (atomic RPC or legacy path). Offline: IndexedDB + sync queue, then POST when online. |
| **How does the DB get updated?** | Only via backend. Backend uses Supabase client; create uses `create_warehouse_product_atomic` (or legacy insert + inventory writes). |
| **How do other devices see the new product?** | By refetching: polling every ~25s when tab visible, or refetch on tab focus, or manual refresh. No real-time push. |
| **What if I’m offline?** | If offline-first is enabled: save to IndexedDB + queue; sync when online. If API-only: save fails with circuit breaker or network error. |

---

## 6. Recommendations (optional)

1. **Confirm production env:** Ensure `VITE_API_BASE_URL` for `warehouse.extremedeptkidz.com` points to the same backend that has the Supabase env and migrations (including `create_warehouse_product_atomic`).
2. **Cross-device latency:** If you need faster visibility on other devices, consider Supabase Realtime (or a WebSocket) for product list changes instead of (or in addition to) polling.
3. **Idempotency:** If you rely on retries, verify the backend implements idempotency for POST create (e.g. by Idempotency-Key) so duplicate requests don’t create duplicate products.
4. **Manual check on production:** Add a product on one browser, then on another device (or incognito) open Inventory and confirm it appears within the poll interval or after refresh.

---

## 7. Sync queue: “Load failed” after first 2 products (issue and fix)

**Symptom:** In offline-first mode, the first 2 products sync successfully; later CREATEs stay in the sync queue with status **“Load failed”** and never appear on the server or product list.

**Root cause:** The browser shows **“Load failed”** when `fetch()` fails before a response (e.g. request body too large, CORS preflight blocked, or connection closed). The most likely cause in this flow is **request body size**: the sync service was sending the full product payload including **base64 images**. The first products may have had no or small images; once payloads grew (e.g. over Vercel’s ~4.5MB body limit), the request failed and the browser reported “Load failed”.

**Fix applied:**

1. **`syncService.js` – `buildProductPayload()`**  
   - Sync payload now **limits images**: only images under ~100KB each and at most 5 are included. Larger or extra images are omitted so the POST body stays under typical server limits.  
   - Product metadata (name, sku, category, quantity, etc.) still syncs; images can be re-added via Edit after sync.  
   - When the backend returns an HTTP status (e.g. 413), that status is stored in the queue error message (e.g. `[413] Payload too large`) so the UI can show a clearer reason.

2. **`SyncQueueModal.tsx`**  
   - When the stored error is “Load failed”, a short hint is shown: “Often connection, CORS, or request too large. Retry; sync omits large images to avoid size limits.”

3. **`docs/TROUBLESHOOTING.md`**  
   - New subsection: **“Sync worked for first 2 items, then Load failed”** with causes (body size, CORS, network) and steps (Retry, check Network tab, backend logs).

**If “Load failed” persists after deploy:** Check that the backend allows `POST` from `https://warehouse.extremedeptkidz.com` (CORS) and that the request body limit is sufficient; see `SERVER_SIDE_FIX_GUIDE.md`.

---

*Audit based on codebase only. No live login or production traffic was inspected.*
