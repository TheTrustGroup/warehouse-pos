# Server "offline" banner and stability

## Why the yellow "Server temporarily unavailable" banner appears

The banner is driven by a **circuit breaker** in the API client. It opens after several **server errors (5xx)** or **network/timeout failures** in a row. When open, the app shows the banner and uses cached data instead of hitting the server.

### Common causes

1. **Vercel serverless cold starts** – First request after idle can take 10–30+ seconds; the client may timeout and record a failure.
2. **Timeouts** – Slow responses (e.g. big product list, cold DB) can hit the client timeout and be counted as failures.
3. **Real 5xx** – Backend or Supabase errors (e.g. misconfigured env, DB limits) return 5xx and open the circuit.
4. **401 Unauthorized** – These do **not** open the circuit (they are client/auth issues). If you see 401 in the console, fix auth/session/cookies; the banner is from 5xx/timeouts, not 401.

### What we changed to reduce jitter and false "offline"

- **Circuit breaker**: Threshold increased from 5 to **8** failures, cooldown from 30s to **45s**, so short blips are less likely to open it.
- **Banner debounce**: The banner only appears after the circuit has been open for **4 seconds**, so brief flickers don’t show.
- **Modal opacity**: Add-product (and side menu) use an opaque panel so the form is readable and the UI doesn’t feel unstable.

## Recommended ways to stop this for good

1. **Backend (API on Vercel)**
   - Set **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** in the **API** project (e.g. `warehouse-pos-api-v2`), not in the frontend project.
   - Keep the API warm: use Vercel cron or a monitoring ping to hit `/api/health` every few minutes so serverless doesn’t cold start on first user request.
   - Ensure timeouts and limits (e.g. product list size, DB timeouts) are sufficient so normal requests don’t time out.

2. **Frontend**
   - **VITE_API_BASE_URL** must point at the deployed API (e.g. `https://warehouse-pos-api-v2.vercel.app`) and the frontend must be redeployed after any change.
   - User session: if you see 401 on `/api/auth/user` or `/admin/api/me`, fix cookie/session (same-site, secure, domain) so the API receives auth.

3. **When the banner does show**
   - User can click **Try again** to reset the circuit and retry, or **Dismiss** to hide it for the session.
   - Cached products and last saved data continue to work; changes sync when the server is back.

## Phase 4 — API reliability and endpoint verification

- **Base URL**: Single source of truth is `API_BASE_URL` from `src/lib/api.ts`. All callers (Inventory, Orders, POS, Reports, Auth, sync) use it. Set `VITE_API_BASE_URL` in env; no hardcoded domains, no browser-specific routing.
- **Timeouts**: All API helpers (GET, POST, PUT, PATCH, DELETE) support `timeoutMs`; default 45s. Timeout aborts the request and can open the circuit.
- **Retry**: Only **GET** (and safe methods) are retried (default 3 attempts with backoff). **POST/PUT/PATCH/DELETE use zero retries** to avoid double submissions and false "saved" states.
- **When server is unavailable**: Banner (already exists). **Destructive actions disabled**: Inventory delete and bulk delete are disabled when the circuit is open (`useApiStatus().isDegraded`). User sees disabled buttons and tooltip "Server unavailable".
- **False "saved"**: Success toasts for server writes only after confirmed 2xx. Local-only saves show "Saved locally. Syncing when online." (InventoryContext, OrderContext already follow this.)

## 413 Payload too large (sync / add product)

Vercel has a **4.5 MB** body size limit. Product images are stored as base64 in the app; one or two large photos can exceed that and cause **413** (often reported in the console as CORS because the 413 response may not include CORS headers).

- **Sync ("Syncing 1 item...")**: When syncing local-only products to the API, the app sends payloads **without images** (`omitImagesForSync`) so sync stays under the limit. The product is created/updated with metadata; you can add images later by editing the product (use smaller images or fewer).
- **Add/Edit product (single save)**: If you hit 413 when saving one product with large images, reduce the number or size of images (e.g. one small image per product), or add images after the product is saved.

## Files involved

- **Circuit breaker**: `src/lib/circuit.ts` (threshold, cooldown), `src/lib/apiClient.ts` (when we call `recordFailure`).
- **Banner**: `src/components/layout/Layout.tsx` (debounce, show/hide, Try again / Dismiss), `src/contexts/ApiStatusContext.tsx` (single source for `isDegraded`).
- **API base & client**: `src/lib/api.ts` (API_BASE_URL), `src/lib/apiClient.ts` (timeouts, retry GET-only, circuit).
- **Destructive actions**: `src/pages/Inventory.tsx` (disable delete when degraded), `ProductTableView` / `ProductGridView` (`disableDestructiveActions`).
- **Modal/panel opacity**: `src/styles/glassmorphism.css` (`.solid-panel`), `src/components/inventory/ProductFormModal.tsx` (opaque overlay + panel).

## Phase 5 — Offline / degraded mode guardrails

- **Read-only mode**:
  - **Inventory**: Read-only only when the server is **degraded** (`readOnlyMode = isDegraded`). When **offline**, Add/Edit remain allowed so products can be saved locally and sync when back online (requires offline feature flag).
  - **POS and Orders**: Read-only when degraded **or** offline (`readOnlyMode = isDegraded || !isOnline`) so Complete sale and order status changes (stock deduction) stay disabled when offline.
- **Disabled actions**:
  - **Inventory**: Add product, Add first product, Edit, and Delete are disabled only when **degraded**. When offline, add/edit are allowed (local save + sync when online).
  - **POS**: Complete sale is disabled when degraded or offline (PaymentPanel shows "Read-only. Writes disabled until connection is restored." and disables the Complete button).
  - **Orders**: All order status actions are disabled when degraded or offline so stock is not deducted while offline/degraded.
- **Labels**:
  - **Offline**: Top banner (NetworkStatusContext) shows "Working Offline — Read-only. Add, edit, and sales disabled."
  - **Degraded**: Layout banner shows "Server temporarily unavailable. Last saved data — read-only. Add, edit, and sales disabled until server is back."
  - **Sync pending**: SyncStatusBar shows "Offline — Read-only. Sync pending: N items" when offline with pending sync items; "Syncing N items..." when syncing.

**Files involved (Phase 5)**  
- **Read-only mode**: `src/pages/Inventory.tsx`, `src/pages/POS.tsx`, `src/pages/Orders.tsx` (compute `readOnlyMode`; disable Add/Edit/Delete, Complete sale, order status actions).  
- **ProductFormModal**: `src/components/inventory/ProductFormModal.tsx` (`readOnlyMode` prop, banner, disabled Submit).  
- **PaymentPanel**: `src/components/pos/PaymentPanel.tsx` (`disableComplete` prop).  
- **Labels**: `src/components/layout/Layout.tsx` (degraded banner copy), `src/contexts/NetworkStatusContext.tsx` (offline banner copy), `src/components/SyncStatusBar.tsx` (offline + sync-pending label).

## Enabling offline product saves

When the device is **offline**, Inventory allows Add/Edit so products can be saved locally and synced when back online. That behavior requires the **offline feature flag** to be on.

1. **Set env (build-time)**  
   - **Local**: In `.env.local` (or copy from `.env.example`), set:
     - `VITE_OFFLINE_ENABLED=true`
     - Optional: `VITE_OFFLINE_ROLLOUT_PERCENT=100` (omit = 100% when enabled).
   - **Vercel**: In the frontend project → Settings → Environment Variables, add:
     - `VITE_OFFLINE_ENABLED` = `true`
     - Optionally `VITE_OFFLINE_ROLLOUT_PERCENT` = `100`.

2. **Rebuild and redeploy**  
   Vite inlines env at build time. After changing these variables, run `npm run build` and redeploy the frontend (e.g. push to trigger Vercel deploy).

3. **Where it’s read**  
   `src/lib/offlineFeatureFlag.ts`: `isOfflineEnabled()` is true when `VITE_OFFLINE_ENABLED` is `true` and (if set) the session falls within `VITE_OFFLINE_ROLLOUT_PERCENT`. When true, Inventory uses IndexedDB + sync queue; add/update offline write locally and sync when online.
