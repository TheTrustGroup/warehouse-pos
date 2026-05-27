# API Endpoints Audit

Comprehensive list of all API calls, callers, response/error handling, and flagged issues.

---

## 1. Backend API Routes (inventory-server)

| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| **GET** | `/api/products` | `app/api/products/route.ts` | List products (warehouse-scoped; auth) |
| **POST** | `/api/products` | same | Create product (admin) |
| **GET** | `/api/products/[id]` | `app/api/products/[id]/route.ts` | Get product by id |
| **PUT** | `/api/products/[id]` | same | Update product |
| **DELETE** | `/api/products/[id]` | same | Delete product |
| **DELETE** | `/api/products/bulk` | `app/api/products/bulk/route.ts` | Bulk delete products |
| **GET** | `/admin/api/products` | `app/admin/api/products/route.ts` | List products (admin) |
| **POST** | `/admin/api/products` | same | Create product (admin) |
| **GET** | `/admin/api/products/[id]` | `app/admin/api/products/[id]/route.ts` | Get product (admin) |
| **PUT** | `/admin/api/products/[id]` | same | Update product (admin) |
| **DELETE** | `/admin/api/products/[id]` | same | Delete product (admin) |
| **DELETE** | `/admin/api/products/bulk` | `app/admin/api/products/bulk/route.ts` | Bulk delete (admin) |
| **GET** | `/api/warehouses` | `app/api/warehouses/route.ts` | List warehouses (optional `store_id`) |
| **GET** | `/api/warehouses/[id]` | `app/api/warehouses/[id]/route.ts` | Get warehouse by id |
| **GET** | `/api/stores` | `app/api/stores/route.ts` | List stores (scope-aware) |
| **GET** | `/api/stores/[id]` | `app/api/stores/[id]/route.ts` | Get store by id |
| **GET** | `/api/orders` | `app/api/orders/route.ts` | List orders — **returns `{ data: [] }`** (no persistence) |
| **POST** | `/api/orders/deduct` | `app/api/orders/deduct/route.ts` | Atomic batch deduction (warehouse/POS) |
| **POST** | `/api/orders/return-stock` | `app/api/orders/return-stock/route.ts` | Return stock (warehouse/POS) |
| **GET** | `/api/transactions` | `app/api/transactions/route.ts` | List transactions (filters, scope-aware) |
| **POST** | `/api/transactions` | same | Persist sale (cashier+; idempotency) |
| **GET** | `/api/stock-movements` | `app/api/stock-movements/route.ts` | List stock movements (admin) |
| **GET** | `/api/size-codes` | `app/api/size-codes/route.ts` | List size codes |
| **GET** | `/api/user-scopes` | `app/api/user-scopes/route.ts` | Get user scopes by email (admin) |
| **PUT** | `/api/user-scopes` | same | Set user scopes (admin) |
| **GET** | `/api/sync-rejections` | `app/api/sync-rejections/route.ts` | List sync rejections (admin) |
| **PATCH** | `/api/sync-rejections/[id]/void` | `app/api/sync-rejections/[id]/void/route.ts` | Void rejection (admin) |
| **POST** | `/api/inventory/deduct` | `app/api/inventory/deduct/route.ts` | Atomic POS deduct (cashier+) |
| **GET** | `/api/test` | `app/api/test/route.ts` | Test route |
| **POST** | `/admin/api/login` | `app/admin/api/login/route.ts` | Admin login |
| **GET** | `/admin/api/me` | `app/admin/api/me/route.ts` | Admin current user |
| **POST** | `/admin/api/logout` | `app/admin/api/logout/route.ts` | Admin logout |
| **POST** | `/api/auth/login` | `app/api/auth/login/route.ts` | Auth login |
| **GET** | `/api/auth/user` | `app/api/auth/user/route.ts` | Current user |
| **POST** | `/api/auth/logout` | `app/api/auth/logout/route.ts` | Auth logout |

---

## 2. Frontend API Calls and Callers

### 2.1 Auth (raw `fetch` + `handleApiResponse`)

| Method | URL | Caller | Response handling | Error handling |
|--------|-----|--------|--------------------|----------------|
| **GET** | `${API_BASE_URL}/admin/api/me` then fallback `${API_BASE_URL}/api/auth/user` | `AuthContext.checkAuthStatus` | `handleApiResponse<User>`; normalize user; store in state + localStorage | 404/403/401 → try other endpoint; catch → clear user, optional `setAuthError` |
| **POST** | `${API_BASE_URL}/admin/api/login` then fallback `/api/auth/login` | `AuthContext.login` | Parse `user` from `data.user` / `data.data.user` / `data`; normalize; store token | 400/422 with `errors` → validation message; 401 → "Invalid email or password"; network → "Cannot reach the server" |
| **POST** | `${API_BASE_URL}/admin/api/logout` then fallback `/api/auth/logout` | `AuthContext.logout`, inactivity timer | No response body used | catch → log; finally always clears user |
| **POST** | Same (inactivity) | `AuthContext` useEffect | Fire-and-forget `.catch(() => {})` | No user feedback |

- **Loading:** `AuthContext` sets `isLoading` during check/login.
- **Validation:** Login supports `errorData.errors` and `errorData.error` / `errorData.message`; no strict schema validation.

---

### 2.2 Products & Inventory (apiClient: apiGet, apiPost, apiPut, apiDelete, apiRequest)

| Method | Path | Caller | Response handling | Error handling |
|--------|-----|--------|--------------------|----------------|
| **GET** | `/api/products` (fallback `/admin/api/products` on 404) | `InventoryContext.loadProducts` | Normalize to `Product[]`; merge local-only; cache; support `{ data, total }` or array | 404 → fallback admin; 403/401/5xx → message; network → "Cannot reach the server"; fallback to IndexedDB/localStorage |
| **GET** | `/api/products?...` or `/admin/api/products?...` | Same (read-after-write, productByIdPath) | `normalizeProduct`; verify `responseIsFullProduct` | 409 on update → refresh list + message |
| **POST** | `/admin/api/products` then `/api/products` | `InventoryContext.addProduct`, `syncLocalInventoryToApi` | Use response as product when full; else read-after-write GET | On both fail → save locally, set localOnlyIds, throw ADD_PRODUCT_SAVED_LOCALLY |
| **PUT** | `/admin/api/products/[id]` then `/api/products/[id]` | `InventoryContext.updateProduct` | Same as POST | 409 → refresh + "Someone else updated..." |
| **DELETE** | `/admin/api/products/[id]` or `/api/products/[id]` | `InventoryContext.deleteProduct`, `deleteProducts` | readAfterDeleteVerify | Bulk: try bulk then per-id; collect errors |
| **DELETE** | `/admin/api/products/bulk` or `/api/products/bulk` | `InventoryContext.deleteProducts` | Body `{ ids }` | No response body validation |

- **Loading:** `InventoryContext.isLoading` and `savePhase` ('saving' | 'verifying' | 'idle').
- **Validation:** `responseIsFullProduct(raw)` checks `raw.id` and name/sku; no Zod/io-ts.

---

### 2.3 Warehouses & Stores

| Method | Path | Caller | Response handling | Error handling |
|--------|-----|--------|--------------------|----------------|
| **GET** | `/api/warehouses` | `WarehouseContext.refreshWarehouses` | `Array.isArray(list) ? list : []` | catch → set warehouses [] |
| **GET** | `/api/warehouses?store_id=...` | `UserManagement` (2 useEffects) | Same; set `warehousesForStore` / `addUserWarehouses` | catch → set [] |
| **GET** | `/api/stores` | `StoreContext.refreshStores` | Same pattern | catch → set stores [] |

- **Loading:** Both contexts expose `isLoading`; Warehouse waits for auth then fetches.

---

### 2.4 Orders (OrderContext)

| Method | Path | Caller | Response handling | Error handling |
|--------|-----|--------|--------------------|----------------|
| **GET** | `/api/orders` | `OrderContext.loadOrders` | `normalizeOrder`; support array or `{ data: Order[] }` | reportError; set orders [] |
| **POST** | `/api/orders` | `OrderContext.createOrder` | `normalizeOrder(savedRaw)`; append to state | showToast error; throw |
| **POST** | `/api/orders/deduct` | `OrderContext.deductStock` | None (void) | Propagates from apiPost |
| **POST** | `/api/orders/return-stock` | `OrderContext.returnStock` | None | Same |
| **PATCH** | `/api/orders/[id]` | `OrderContext.updateOrderStatus` | normalizeOrder; update state | showToast; throw |
| **PATCH** | `/api/orders/[id]/assign-driver` | `OrderContext.assignDriver` | Same | No try/catch around apiPatch |
| **PATCH** | `/api/orders/[id]/deliver` | `OrderContext.markAsDelivered` | Same | No try/catch |
| **PATCH** | `/api/orders/[id]/fail` | `OrderContext.markAsFailed` | None | No try/catch |
| **PATCH** | `/api/orders/[id]/cancel` | `OrderContext.cancelOrder` | None | No try/catch |

- **Backend gap:** Only **GET** `/api/orders` (returns `{ data: [] }`), **POST** `/api/orders/deduct`, and **POST** `/api/orders/return-stock` exist. **POST** `/api/orders`, **PATCH** `/api/orders/:id`, `assign-driver`, `deliver`, `fail`, `cancel` are **not implemented** → these calls will 404 and orders are never persisted on the server.

---

### 2.5 Transactions & POS

| Method | Path | Caller | Response handling | Error handling |
|--------|-----|--------|--------------------|----------------|
| **GET** | `/api/transactions?from=&to=&...` | `transactionsApi.fetchTransactionsFromApi` → `Reports` | `rowToTransaction`; return `{ data, total }` | Caller: Reports catch → fallback to localStorage |
| **POST** | `/api/transactions` | `offlineSync.syncPendingPosEvents` (idempotency key = event_id) | Use `res?.id` for transaction_id; update event status SYNCED/FAILED | 409 / INSUFFICIENT_STOCK / VOIDED → mark FAILED; network/5xx → leave PENDING |

- **POS flow:** `POSContext.processTransaction` → `enqueuePosEvent` (no direct HTTP); background `syncPending()` calls `syncPendingPosEvents` which POSTs to `/api/transactions`.
- **Loading:** Reports uses `transactionsLoading` and shows "Loading…" and source (server vs local).

---

### 2.6 User scopes & Sync rejections

| Method | Path | Caller | Response handling | Error handling |
|--------|-----|--------|--------------------|----------------|
| **GET** | `/api/user-scopes?email=...` | `userScopesApi.getUserScopes` → UserManagement | `res?.scopes ?? []` | UserManagement: showToast 'Failed to load scope' |
| **PUT** | `/api/user-scopes` | `userScopesApi.setUserScopes` → UserManagement | No use of response | Caller handles success/error toasts |
| **GET** | `/api/sync-rejections?voided=&limit=` | `syncRejectionsApi.fetchSyncRejections` → SyncRejectionsCard | `res?.data ?? []` | SyncRejectionsCard: catch → setList([]) |
| **PATCH** | `/api/sync-rejections/[id]/void` | `syncRejectionsApi.voidSyncRejection` → SyncRejectionsCard | None | showToast 'Failed to void. Try again.' |

- **Loading:** UserManagement has `loadingScopes`/`savingScopes`; SyncRejectionsCard has `loading` and `voidingId`.

---

### 2.7 Size codes & Observability

| Method | Path / URL | Caller | Response handling | Error handling |
|--------|------------|--------|--------------------|----------------|
| **GET** | `/api/size-codes` | `ProductFormModal` useEffect | `res?.data ?? []` (array) | .catch(() => setSizeCodes([])) |
| **GET** | `config.healthUrl` (external) | `observability.healthPing` | res.ok | catch → false |

- **Size-codes:** No loading state in modal; silent empty list on error.

---

## 3. Base URL and Client Configuration

- **Single base URL:** All frontend calls use `API_BASE_URL` from `src/lib/api.ts`.
- **Definition:**  
  `API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'https://extremedeptkidz.com').replace(/\/$/, '')`
- **Usage:** Consistent: `apiGet(API_BASE_URL, path)`, `apiPost(API_BASE_URL, path, body)`, etc. Only auth uses raw `fetch(\`${API_BASE_URL}/...\`)`.

---

## 4. Response Handling Logic (summary)

- **apiClient (apiRequest):** On 2xx and JSON → `res.json()`; non-JSON → `null`. On error → parse body for `error`/`message`, attach `status` and `response` to thrown Error; retries for GET and on 408/429/5xx for POST/PUT/PATCH when retryable.
- **handleApiResponse (api.ts):** Used only in AuthContext for me/user and login. Throws if !response.ok with message from JSON or status text; returns parsed JSON for 2xx.
- **Normalization:** Products: `normalizeProduct`; Orders: `normalizeOrder` (dates, nested objects); Transactions: `rowToTransaction` (snake → camel, dates).
- **Validation:** No shared response schemas (e.g. Zod). Reliance on `res?.data`, `Array.isArray()`, and ad-hoc checks like `responseIsFullProduct`.

---

## 5. Error Handling Implementation

- **apiClient:** Circuit breaker + retries; throws with `status` and `response`; AbortError → timeout message mentioning VITE_API_BASE_URL.
- **AuthContext:** Network type check; 401/403/404 for me → try other endpoint or clear session; login validation/backend error messages.
- **InventoryContext:** 404 → admin fallback; 403/401/5xx/network → set error message; fallback to IndexedDB/localStorage; 409 on update → refresh and message.
- **OrderContext:** loadOrders: reportError + set orders []; createOrder/updateOrderStatus: showToast + throw; assignDriver, markAsDelivered, markAsFailed, cancelOrder: no try/catch → unhandled rejection on 404/5xx.
- **Reports:** fetchTransactionsFromApi in try/catch; fallback to localStorage on error.
- **UserManagement:** Warehouses: catch → set []; scopes: showToast.
- **SyncRejectionsCard:** fetch catch → setList []; void catch → toast.
- **ProductFormModal:** size-codes catch → setSizeCodes [].
- **WarehouseContext / StoreContext:** catch → set list [] and setIsLoading(false).

---

## 6. Flagged Issues

### 6.1 Hardcoded URLs that should be environment variables

| Location | Current | Recommendation |
|----------|--------|-----------------|
| `src/lib/api.ts` | Default `API_BASE_URL = 'https://extremedeptkidz.com'` when `VITE_API_BASE_URL` unset | Already env-driven; default is documented for build success. **Flag:** Ensure production always sets `VITE_API_BASE_URL` so no accidental use of hardcoded default in production. |
| `observability.healthPing(url)` | URL from `config.healthUrl` (set at app init) | If health URL is ever hardcoded elsewhere, it should be env (e.g. `VITE_HEALTH_URL` or derive from API_BASE_URL). |

### 6.2 Missing error boundaries

| Area | Finding |
|------|--------|
| App root | Single `ErrorBoundary` in `main.tsx` wrapping the app — **present**. |
| Route-level | No route- or feature-specific error boundaries (e.g. POS, Inventory, Settings). A failure in one section can take down the whole app until refresh. |
| Recommendation | Add error boundaries around major routes or lazy-loaded sections (e.g. POS, Inventory, Reports, Settings) with fallback UI and optional reportError. |

### 6.3 Inconsistent base URL usage

| Finding |
|--------|
| Base URL usage is **consistent**: all server calls use `API_BASE_URL` from `api.ts`. |
| Auth uses raw `fetch(\`${API_BASE_URL}/...\`)`; all other features use `apiGet`/`apiPost`/etc. from apiClient with `API_BASE_URL` — same base, different client (no retries/circuit breaker for auth). |

### 6.4 Missing loading states

| Caller / flow | Loading state |
|---------------|----------------|
| Auth | `AuthContext.isLoading` — used (App, ProtectedRoute). |
| Inventory | `InventoryContext.isLoading`, `savePhase` — used (Inventory page, forms). |
| Warehouses / Stores | `WarehouseContext.isLoading`, `StoreContext.isLoading` — used (Header, etc.). |
| Orders | `OrderContext.isLoading` — used (Orders page). |
| Reports | `transactionsLoading` — used (Loading… and source label). |
| UserManagement | `loadingScopes`, `savingScopes` — used for scope load/save; warehouse dropdowns for store: no dedicated loading (data loads in background). |
| SyncRejectionsCard | `loading`, `voidingId` — used. |
| **ProductFormModal** | **Missing:** Size codes fetched in useEffect with no loading flag; modal can show with empty sizes until request completes. |
| **OrderContext** | **Missing:** assignDriver, markAsDelivered, markAsFailed, cancelOrder do not set a per-action loading state; user gets no spinner during PATCH. |

### 6.5 Lack of proper response validation

| Area | Finding |
|------|--------|
| Products | `responseIsFullProduct` only checks `id` and name/sku; no schema for nested (quantityBySize, location, etc.). |
| Orders | `normalizeOrder` trusts shape; backend does not persist orders — response for POST/PATCH is never returned by current backend. |
| Transactions | `rowToTransaction` maps known fields; no check for required fields or types. |
| Auth | Login accepts `data.user` / `data.data.user` / `data`; no strict shape. |
| General | No Zod/io-ts (or similar) for any API response; malformed or changed API can cause runtime errors or wrong UI. |
| Recommendation | Introduce response DTOs and validate (e.g. Zod) for at least critical paths: login/me, products list/detail, transactions list, and order payloads when backend exists. |

### 6.6 Backend endpoints called but not implemented

| Method | Path | Caller | Backend |
|--------|-----|--------|---------|
| **POST** | `/api/orders` | OrderContext.createOrder | **Not implemented** (GET returns empty only) |
| **PATCH** | `/api/orders/[id]` | OrderContext.updateOrderStatus | **Not implemented** |
| **PATCH** | `/api/orders/[id]/assign-driver` | OrderContext.assignDriver | **Not implemented** |
| **PATCH** | `/api/orders/[id]/deliver` | OrderContext.markAsDelivered | **Not implemented** |
| **PATCH** | `/api/orders/[id]/fail` | OrderContext.markAsFailed | **Not implemented** |
| **PATCH** | `/api/orders/[id]/cancel` | OrderContext.cancelOrder | **Not implemented** |

These will return 404. Order creation/updates appear to succeed only in local state and localStorage; no server persistence for orders.

---

## 7. Quick reference: who calls what

- **AuthContext:** admin/api/me, api/auth/user, admin/api/login, api/auth/login, admin/api/logout, api/auth/logout (raw fetch).
- **InventoryContext:** /api/products, /admin/api/products, /api/products/[id], /admin/api/products/[id], /api/products/bulk, /admin/api/products/bulk (apiClient).
- **WarehouseContext:** /api/warehouses (apiGet).
- **StoreContext:** /api/stores (apiGet).
- **OrderContext:** /api/orders, /api/orders/deduct, /api/orders/return-stock, /api/orders/[id], assign-driver, deliver, fail, cancel (apiGet, apiPost, apiPatch).
- **POSContext:** No direct HTTP; enqueuePosEvent → offlineSync → POST /api/transactions.
- **Reports:** fetchTransactionsFromApi(API_BASE_URL) → GET /api/transactions.
- **UserManagement:** /api/warehouses?store_id=, getUserScopes/setUserScopes → GET/PUT /api/user-scopes.
- **SyncRejectionsCard:** fetchSyncRejections, voidSyncRejection → GET /api/sync-rejections, PATCH /api/sync-rejections/[id]/void.
- **ProductFormModal:** GET /api/size-codes.
- **observability:** healthPing(config.healthUrl) — GET (external URL).

---

*Generated from codebase review. Last substantive check: backend route handlers and frontend callers (Auth, Inventory, Order, POS, Reports, UserManagement, SyncRejections, Warehouses, Stores, Size-codes, Observability).*
