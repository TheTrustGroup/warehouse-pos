# App briefing: connectivity, database, page load, and speed

**Purpose:** Quick reference for how this warehouse/POS app connects to the database, how pages load, and what affects speed. Use this when onboarding or debugging.

---

## 1. High-level architecture

```
[Browser] ←→ [Vite/React SPA] ←→ [inventory-server (Next.js on Vercel)] ←→ [Supabase Postgres]
```

- **Frontend:** React SPA in `warehouse-pos/src/`. Built with Vite. No direct DB connection.
- **Backend:** Next.js app in `warehouse-pos/inventory-server/`. Runs as Vercel serverless. **Only** the backend talks to Supabase.
- **Database:** Supabase (Postgres). Tables include `warehouse_products`, `warehouse_inventory`, `warehouse_inventory_by_size`, `sales`, `orders`, etc. Migrations live in `inventory-server/supabase/migrations/`.

---

## 2. Database connectivity

### 2.1 Who talks to the database?

- **Only the inventory-server** (Next.js API routes) talks to Supabase.
- The React app **never** uses Supabase client in the browser for product/order/inventory data; it uses **REST API** only (`API_BASE_URL` + `/api/...`).

### 2.2 How the server connects to Supabase

- **Single shared client:** `inventory-server/lib/supabase/admin.ts` creates one `createClient(url, key)` (lazy init). All API routes use `getSupabase()` / `getSupabaseAdmin()` from `lib/supabase.ts` and `lib/data/warehouseProducts.ts`. This avoids connection pool exhaustion.
- **Env:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel (and locally in `.env` for `inventory-server`). Missing env → 500 and clear error in logs.
- **Auth:** Server uses **service role** for DB; user auth is via Bearer token or session cookie and validated in API routes (e.g. `requireAuth`, `getScopeForUser`).

### 2.3 Main API surface (backend → DB)

| Route / area        | Purpose |
|---------------------|--------|
| `GET/POST/PUT/DELETE /api/products` | Products list, create, update, delete (warehouse-scoped). |
| `GET /api/dashboard` | Dashboard stats (e.g. stock value, counts). |
| `GET /api/warehouses`, `GET /api/stores` | Scope data for sidebar and warehouse selector. |
| `GET/POST /api/sales`, `POST /api/inventory/deduct` | POS sales and stock deduction. |
| `GET/POST /api/orders` | Orders and returns. |
| `GET /api/health`     | Liveness; no DB. |

All of these go through the same Supabase client and CORS layer (`lib/cors.ts`).

---

## 3. Frontend → backend connectivity

### 3.1 API base URL

- **Single source of truth:** `src/lib/api.ts` exports `API_BASE_URL`.
- **Config:** `VITE_API_BASE_URL` at build time.
  - **Same-origin:** Set to `""` so the app calls `/api/...` on the same host (no CORS).
  - **Cross-origin:** Set to the API origin (e.g. `https://warehouse-pos-api-v2.vercel.app`). CORS must allow the frontend origin (see `inventory-server/lib/cors.ts` and `docs/FRONTEND_BACKEND_COMMUNICATION.md`).

### 3.2 Auth sent to API

- `getAuthToken()` in `api.ts` reads token from localStorage (`auth_token`, `access_token`, `token`) or from `current_user` object.
- `getApiHeaders()` adds `Authorization: Bearer <token>` and `Content-Type`/`Accept`. All `apiRequest` / `apiGet` / `apiPost` etc. use these headers; credentials are `include` for cookies when same-origin.

### 3.3 Resilient client (timeouts, retries, circuit breaker)

- **`src/lib/apiClient.ts`:**
  - **Timeouts:** Default 45s; overridable per call (e.g. dashboard 35s, products 55s). Request is aborted after timeout.
  - **Retries:** GET (and safe methods) retry on 5xx/timeout with backoff (up to 3 by default). POST/PUT/PATCH/DELETE do **not** retry (avoid duplicate writes).
  - **Circuit breaker:** `src/lib/circuit.ts`. After many failures (e.g. 12), the circuit “opens” and blocks new requests for ~60s. UI shows “Server temporarily unavailable” and a Retry button. Retry resets the circuit.
- **Usage:** Dashboard, products, warehouses, and other critical GETs use `apiGet(API_BASE_URL, path, { timeoutMs, signal })` so they get retries and circuit behaviour. Mutations use `apiPost` / `apiPut` / `apiDelete` (no retries).

---

## 4. How pages load

### 4.1 Boot and auth

1. **App shell:** `App.tsx` wraps the app in providers: `ToastProvider`, `NetworkStatusProvider`, `SettingsProvider`, `AuthProvider`, `QueryClientProvider`, `BrowserRouter`, then `ProtectedRoutes`.
2. **Auth:** `AuthProvider` loads session. If not authenticated → redirect to `/login`. If auth loading → full-screen “Loading…”.
3. **Protected routes:** After login, `ProtectedRoutes` renders `CriticalDataProvider` → `RealtimeProvider` → `StoreProvider` → `WarehouseProvider` → `WarehouseGuard` → `PresenceProvider` → `InventoryProvider` → `POSProvider` → `OrderProvider` → `CriticalDataGate` → `Layout` (sidebar + outlet).

### 4.2 Critical data gate (what blocks the UI)

- **`CriticalDataContext` + `CriticalDataGate`:** After user is set, the gate runs a **two-phase** load before showing the main UI:
  - **Phase 1 (blocking):** Parallel: health warmup (fire-and-forget), `refreshStores()`, `refreshWarehouses()`. UI stays on “Loading warehouse…” until Phase 1 completes.
  - **Phase 2 (non-blocking):** App is already visible. In background: `refreshProducts(bypassCache: true)`, `refreshOrders()`. When these finish, products/orders update (and any error is stored in `criticalDataError`).
- So: **stores and warehouses** must load before the user sees the app; **products and orders** load in the background and may show cached data first, then refresh.
- All these calls use `apiRequest`/`apiGet` with retries and a long initial timeout (90s). 401 triggers session refresh and retry.

### 4.3 Route-level loading (lazy + suspense)

- **POS** is in the **main bundle** so `/pos` and cart never wait on a chunk (critical path).
- **Other pages** are lazy-loaded with **retry:** `lazyWithRetry(...)` in `App.tsx` (Dashboard, Inventory, Sales, Deliveries, Orders, Reports, Settings, Login, NotFound). If a chunk fails to load (e.g. network), the loader retries up to 3 times with delay before showing an error.
- **Suspense:** A single `<Suspense fallback={<LoadingScreen message="Loading…" />}>` wraps all routes, so the first time you navigate to a lazy route you see the loading screen until the chunk and its data are ready.

### 4.4 Per-page data (React Query + contexts)

- **Products:** `InventoryContext` uses React Query (`useQuery` with `queryKeys.products(warehouseId)`). `fetchProductsForWarehouse` paginates (e.g. 250 per request) and is the single source for the products list. Cache: React Query (e.g. 2m stale, 10m gc); optional IndexedDB for offline.
- **Warehouses:** `WarehouseContext` fetches `GET /api/warehouses` after auth; selection is stored in localStorage and used by Dashboard, Inventory, POS.
- **Dashboard:** Fetches `GET /api/dashboard` (with warehouse scope). Uses resilient client; has its own timeout and Retry button.
- **POS:** Uses products from `InventoryContext` (same React Query cache). Cart and charge flow call `/api/sales`, `/api/inventory/deduct`, etc.
- **Realtime:** Optional. `RealtimeProvider` can subscribe to Supabase Realtime for live updates; if the WebSocket fails, the app still works via REST and shows a degraded message. Realtime is not required for list/mutations.

---

## 5. Speed and performance

### 5.1 What makes the app feel fast

- **Critical data:** Only stores + warehouses block; products/orders load in background so the shell appears quickly.
- **Health warmup:** A cheap `GET /api/health` is fired in parallel with Phase 1 to reduce serverless cold start impact on the next request.
- **React Query:** Cached data is shown immediately when navigating back to a page; refetch can happen in background.
- **Lazy routes:** Only the current route’s chunk is loaded; POS is in main bundle so the main sales path has no chunk delay.
- **Retries and circuit breaker:** Transient 5xx or timeouts are retried; persistent failure shows a clear “try again” instead of hanging.

### 5.2 What can make it slow

- **Serverless cold start:** First request after idle can take several seconds. Health warmup and long client timeouts (e.g. 90s for initial load) mitigate this.
- **Heavy GET /api/products:** Large warehouses or missing indexes can push products request toward the 25s request timeout; server returns 503 on timeout. Indexes on `warehouse_id`, `product_id`, and list ordering help (see `docs/SERVER_STABILITY_AND_AVAILABILITY.md`).
- **Dashboard:** Uses an internal timeout (~22s) and returns 503 with `Retry-After` if stats take too long. Dashboard stats can be cached (e.g. Redis) when configured.
- **Network:** Slow or flaky networks hit timeouts and retries; circuit opens after many failures and blocks for cooldown.

### 5.3 What you should see (recent performance work)

- **Initial load:** Only the **first 50 products** are fetched (not the full list). You should see “X products (50 loaded) · Page 1 of Y” and a faster first paint. “Load more” fetches the next 250.
- **List view:** The first products request uses `view=list` (slimmer payload: no description, location, supplier, tags). You won’t see a UI change; network payload is smaller.
- **No duplicate cards:** The products list is deduped by id so background refetch or “Load more” never shows the same product twice.
- **CDN / image optimization:** Supabase Storage public URLs are automatically rewritten to the Image Transform API (thumb/medium/full). Store product image URLs in Supabase Storage and put the public URL in `product.images[]`; see `docs/CDN_AND_IMAGE_OPTIMIZATION.md` for how to set it up.

### 5.4 Timeouts (summary)

| Layer        | Typical value | Notes |
|-------------|----------------|--------|
| Client (apiClient) | 45s default | Overridable (e.g. 35s dashboard, 55s products, 90s critical load). |
| Products GET (server) | 25s request, 20s query | Returns 503 on timeout. |
| Dashboard (server)   | ~22s internal | Returns 503 + Retry-After. |
| Vercel function      | maxDuration 30 (products/dashboard) | Requires Pro for >10s. |

---

## 6. References in repo

| Topic           | Where to look |
|----------------|----------------|
| API base URL & CORS | `src/lib/api.ts`, `inventory-server/lib/cors.ts`, `docs/FRONTEND_BACKEND_COMMUNICATION.md` |
| Resilient client    | `src/lib/apiClient.ts`, `src/lib/circuit.ts` |
| Critical data flow | `src/contexts/CriticalDataContext.tsx` |
| Products & React Query | `src/contexts/InventoryContext.tsx`, `src/lib/queryClient.ts`, `src/lib/queryKeys.ts` |
| Server stability & 503/500 | `docs/SERVER_STABILITY_AND_AVAILABILITY.md` |
| DB access on server | `inventory-server/lib/supabase/admin.ts`, `inventory-server/lib/data/warehouseProducts.ts` |
| Routing & lazy load  | `src/App.tsx` |
| CDN / image optimization | `src/lib/productImageUrl.ts`, `docs/CDN_AND_IMAGE_OPTIMIZATION.md` |

---

**Summary for Claude:** The app is a React SPA that talks only to a Next.js API (inventory-server) over REST. The API is the only layer that connects to Supabase. Pages load after auth and a two-phase critical load (stores/warehouses block; products/orders in background). Speed is helped by health warmup, React Query cache, lazy routes with retry, and a resilient API client with timeouts, retries, and a circuit breaker. Slow spots are usually cold start, heavy products/dashboard queries, or network; indexes and caching are documented in the server-stability doc.
