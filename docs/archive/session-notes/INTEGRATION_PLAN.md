# Offline System Integration Plan

**Quick reference — variables to set**

| Variable | Where to set | Effect |
|----------|----------------|--------|
| `VITE_OFFLINE_ENABLED` | `.env.local` (copy from `.env.example`) or **Vercel: Settings → Environment Variables** | `true` = enable offline (IndexedDB + sync + SW). `false` or unset = API-only. |
| `VITE_OFFLINE_ROLLOUT_PERCENT` | Optional. Same places. | 0–100. e.g. `10` = 10% of sessions get offline. Omit or `100` = full rollout. |

Build-time only (Vite bakes these into the client). **Vercel:** after changing env vars, redeploy (Deployments → Redeploy) so the new build picks them up.

---

This document defines a **step-by-step, low-risk integration** of the offline (IndexedDB + sync queue + service worker) system **without breaking existing API-based functionality**. Each phase must be tested and signed off before proceeding.

---

## Critical Rules

- **Do not rush.** Each phase has explicit testing criteria; do not advance until they pass.
- **Keep both systems running in parallel** until Phase 7 is complete and stable.
- **Use a feature flag** to toggle offline mode; use a rollout percentage to enable for a subset of users first.
- **If anything breaks,** use the rollback procedure immediately and fix before re-enabling.

---

## Step 1: Backup Current Code

**Purpose:** Ensure you can revert to a known-good state at any time.

| # | Action | Command / check |
|---|--------|------------------|
| 1.1 | Create integration branch | `git checkout -b offline-integration` |
| 1.2 | Ensure working tree is clean | `git status` (no uncommitted changes, or commit them first) |
| 1.3 | Commit current state | `git add -A && git commit -m "Pre-offline backup"` |
| 1.4 | Tag for rollback | `git tag pre-offline-integration` |
| 1.5 | Push branch (optional) | `git push -u origin offline-integration` |

**Success criteria:** Branch `offline-integration` exists; tag `pre-offline-integration` points to the commit; `npm run build` and `npm run test` pass on that commit.

---

## Step 2: Feature Flag and Fallback Infrastructure

**Purpose:** Ability to turn offline on/off and to fall back to API-only when IndexedDB or quota fails.

### 2.1 Add environment-based feature flag

- **File:** `.env.example` and deployment config (e.g. Vercel env).
- **Variable:** `VITE_OFFLINE_ENABLED` (e.g. `true` / `false`). Default in code: `false` so production stays API-only until you flip it.
- **Optional:** `VITE_OFFLINE_ROLLOUT_PERCENT` (0–100). When set, only that percentage of users get offline mode (e.g. 10 for 10%). Use a stable seed (e.g. user id or session storage key) to compute `hash(seed) % 100 < VITE_OFFLINE_ROLLOUT_PERCENT`.

**Implementation:**

- **File:** `src/lib/offlineFeatureFlag.ts`
- **API:** `isOfflineEnabled(): boolean` — returns true only when `VITE_OFFLINE_ENABLED` is true and (if `VITE_OFFLINE_ROLLOUT_PERCENT` is set) the current session falls in the rollout bucket.
- Use `isOfflineEnabled()` anywhere you choose between “API + cache” and “IndexedDB + sync queue” (e.g. InventoryContext, NetworkStatusContext, main.tsx for SW).

### 2.2 IndexedDB availability and quota

- **File:** `src/db/inventoryDB.js` (or a wrapper).
- Before any Dexie call, ensure `indexedDB` is defined (already true in browsers).
- **Quota:** When a write fails, catch `QuotaExceededError` (or `DOMException` with `name === 'QuotaExceededError'`). On quota exceeded:
  - Set an in-memory or sessionStorage flag: `offline_storage_quota_exceeded`.
  - Show a toast or banner: “Local storage is full. Some offline features are disabled. Clear local data in Settings → Admin & logs if needed.”
  - Fall back to API-only for the rest of the session (or until user clears data).

### 2.3 “Clear local data” option

- **Location:** Already present: Settings → Admin & logs (and optionally Data & cache).
- **Actions:** Clear failed sync items; clear logs; **add “Clear all local product data”** that:
  - Clears Dexie tables `products` and `syncQueue` (and optionally metadata for sync/conflict).
  - Does **not** clear authentication or app settings unless desired.
- Document in UI: “This removes locally stored products and pending sync. Server data is unchanged. You will need to reload from server.”

**Environment variables (add to .env.example or deployment config):**

- `VITE_OFFLINE_ENABLED` — Set to `true` to enable offline mode when rollout is 100%; default (unset or false) = API-only.
- `VITE_OFFLINE_ROLLOUT_PERCENT` — Optional. 0–100. When set, only this percentage of sessions get offline mode (e.g. `10` for 10%). Omit or 100 for full rollout.

**Where to set them:**

| Where | What to set |
|-------|-------------|
| **Local dev** | Copy `.env.example` to `.env.local`. Set `VITE_OFFLINE_ENABLED=true` to test offline; set `false` or omit for API-only. |
| **Vercel** | **Project → Settings → Environment Variables.** Add `VITE_OFFLINE_ENABLED` and optionally `VITE_OFFLINE_ROLLOUT_PERCENT`. Choose **Production**, **Preview**, and/or **Development** for each. Save and **redeploy** so the new build picks them up. See *Vercel (below)*. |
| **Netlify** | Site → Build & deploy → Environment. Same variable names. |
| **Docker / CI** | Pass env at build time: `VITE_OFFLINE_ENABLED=true npm run build`. Values are baked into the client bundle at build time. |
| **Rollback** | Set `VITE_OFFLINE_ENABLED=false`, redeploy. Optionally set `VITE_OFFLINE_ROLLOUT_PERCENT=0`. |

**Vercel (step-by-step):**

1. Open your project in the [Vercel dashboard](https://vercel.com/dashboard).
2. Go to **Settings → Environment Variables**.
3. Add:
   - **Name:** `VITE_OFFLINE_ENABLED`  
     **Value:** `false` (API-only, default) or `true` (enable offline).  
     **Environments:** check Production (and Preview if you want it on PR previews).
   - **Name:** `VITE_OFFLINE_ROLLOUT_PERCENT` (optional)  
     **Value:** `100` (full rollout) or e.g. `10` (10% of sessions).  
     **Environments:** same as above.
4. Click **Save**.
5. **Redeploy** so the new values are used: **Deployments** → ⋮ on latest deployment → **Redeploy** (or push a new commit).

Vite reads these at **build time**; they are baked into the client bundle. Changing env vars without redeploying will not change behaviour until the next build.

**Testing criteria for Step 2:**

- [ ] With `VITE_OFFLINE_ENABLED=false`, app behaves exactly as before (API + existing cache).
- [ ] With `VITE_OFFLINE_ENABLED=true`, code path that uses IndexedDB is used (can be a no-op in Phase 1).
- [ ] Quota exceeded path is unit-tested or manually triggered (e.g. DevTools → Application → Storage → “Simulate quota exceeded” if available, or fill storage).
- [ ] “Clear all local product data” wipes products and sync queue and does not break login or settings.

---

## Phase 1: Add IndexedDB Alongside Existing API (Do Not Replace)

**Goal:** IndexedDB (Dexie) is written to in addition to existing API calls. No component reads from IndexedDB yet for the primary list.

| # | Task | Files / notes |
|---|------|----------------|
| 1.1 | Ensure Dexie DB and schema exist | `src/db/inventoryDB.js` — already defines `products`, `syncQueue`, `metadata`. |
| 1.2 | After every successful API product load, mirror to IndexedDB | In `InventoryContext.tsx` (or wherever `loadProducts` / API fetch runs), after `setProducts(merged)` and cache write, call a single “mirror to IDB” function that: (a) opens Dexie, (b) clears `products` table (or upserts by id), (c) bulk-adds current product list with `syncStatus: 'synced'`, `serverId: product.id`. Do not change the source of truth for the UI yet — UI still reads from React state (API response). |
| 1.3 | Guard with feature flag | Call mirror only when `isOfflineEnabled()` is true. |
| 1.4 | Guard with availability | If IndexedDB open or write throws (e.g. private mode, quota), catch and set quota/disabled flag; do not break API flow. |

**Testing criteria:**

- [ ] With offline flag **off:** No IndexedDB writes; app behavior unchanged.
- [ ] With offline flag **on:** After loading products from API, IndexedDB `products` table contains the same list (inspect in DevTools → Application → IndexedDB → ExtremeDeptKidzDB).
- [ ] Failed IndexedDB (e.g. disable IndexedDB in DevTools or use unsupported browser) does not break loading or display; API and cache still work.
- [ ] All existing tests and manual smoke tests (login, view list, RBAC) pass.

---

## Phase 2: Test IndexedDB Operations Independently

**Goal:** Validate CRUD and queries on IndexedDB only, without changing any UI data source.

| # | Task | Notes |
|---|------|--------|
| 2.1 | Unit tests for inventoryDB | `getAllProducts`, `addProduct`, `updateProduct`, `deleteProduct`, `getSyncQueueItems`, `getFailedQueueItems`, `exportAllData`, `importFromBackup` (use fake-indexeddb or run in browser). |
| 2.2 | Manual test page or script | Optional: a small dev-only page or console script that (a) writes a product via `addProduct`, (b) reads via `getAllProducts`, (c) updates, (d) deletes, (e) exports backup and re-imports. Confirm no errors and data shape correct. |
| 2.3 | Migration test | Open app with existing DB at version 1; deploy code with version 2 and empty upgrade. Confirm DB opens and reads without error. |

**Testing criteria:**

- [ ] All new/updated IndexedDB unit tests pass.
- [ ] Manual IndexedDB CRUD and export/import work; no console errors.
- [ ] No change to production UI or API behavior.

---

## Phase 3: Add Sync Queue (Do Not Activate Auto-Sync)

**Goal:** Sync queue is populated when local writes happen, and can be processed manually. Auto-sync (interval + on reconnect) is **not** started yet.

| # | Task | Files / notes |
|---|------|----------------|
| 3.1 | Ensure sync queue is written on local mutations | `inventoryDB.addProduct`, `updateProduct`, `deleteProduct` already add to `syncQueue`. Confirm they are only called when you explicitly switch a component to “offline path” later — in Phase 1–3, API path should still be the one used for user actions. |
| 3.2 | Expose manual “Sync now” | Already in UI: Sync status bar and Settings → Admin & logs → “Sync now” call `syncService.processSyncQueue()`. Ensure they are wired and only enabled when offline flag is on. |
| 3.3 | Do not start auto-sync | In `NetworkStatusContext` and any `useEffect` that calls `syncService.startAutoSync()`, gate with `isOfflineEnabled()`. If `startAutoSync` is currently called unconditionally, change it to: only call when `VITE_OFFLINE_ENABLED` is true (and optionally rollout %). Same for “sync on reconnect” (calling `processSyncQueue` when going online). |

**Testing criteria:**

- [ ] With offline flag on, adding/editing/deleting a product via the **offline path** (e.g. a single test component) adds items to `syncQueue`; with flag off, no queue writes from that flow.
- [ ] “Sync now” runs without errors when queue has pending items; items move to synced or failed; no auto-sync runs in the background until Phase 8.
- [ ] Existing API-based add/edit/delete flows still work and are unchanged.

---

## Phase 4: Test Sync Queue Manually

**Goal:** Validate sync queue processing and conflict handling without affecting the main UI data source.

| # | Task | Notes |
|---|------|--------|
| 4.1 | Create pending items (offline path only) | Use a test component or DevTools: add a product via `inventoryDB.addProduct` so queue has one CREATE. |
| 4.2 | Run “Sync now” | Confirm POST to API succeeds; queue item removed; product row gets `serverId` and `syncStatus: 'synced'`. |
| 4.3 | Test UPDATE and DELETE | Add UPDATE and DELETE queue items (e.g. via `inventoryDB.updateProduct` / `deleteProduct` in test), then “Sync now”; confirm PUT/DELETE and queue cleanup. |
| 4.4 | Test conflict (409) | If backend can return 409, trigger a conflict and confirm ConflictModal or last-write-wins behavior; no unhandled errors. |
| 4.5 | Test offline | Set network offline; run “Sync now”; confirm sync-failed or queue stays pending; no crash. |

**Testing criteria:**

- [ ] All manual sync tests pass; queue length and Admin dashboard match expectations.
- [ ] No regressions in API-only flows or RBAC.

---

## Phase 5: Replace API Calls in ONE Component (Product List)

**Goal:** One place in the app uses IndexedDB + sync as the source of truth for the product list; everywhere else still uses API.

| # | Task | Files / notes |
|---|------|----------------|
| 5.1 | Choose the component | Recommended: **Inventory page** product list (the list that shows products and supports add/edit/delete). |
| 5.2 | Use offline hook when flag is on | In `InventoryContext.tsx` (or the component that provides product list to Inventory): when `isOfflineEnabled()` is true, use `useOfflineInventory()` (or equivalent) for: products list, addProduct, updateProduct, deleteProduct, forceSync, unsyncedCount. When flag is false, keep existing API + state + cache logic unchanged. |
| 5.3 | Initial load | When offline is enabled, initial load can be: (a) read from IndexedDB first (show immediately), then optionally call API and merge/mirror into IDB in background; or (b) call API first, mirror to IDB, then switch to IDB for subsequent reads. Document the chosen strategy in code. |
| 5.4 | Do not remove API calls yet | Keep the API load path in code; it is used when flag is off or as a fallback when IDB fails. |

**Testing criteria:**

- [ ] With **offline flag off:** Inventory list and CRUD behave exactly as before (API + cache).
- [ ] With **offline flag on:** Inventory list is read from IndexedDB; add/edit/delete update IndexedDB and sync queue; list updates immediately; “Sync now” syncs to server.
- [ ] Role-based access (view/edit/delete permissions) still enforced for the Inventory page.
- [ ] Other pages (Dashboard, POS, Orders, Reports, Settings) unchanged and still using API where applicable.
- [ ] Full regression: login, navigation, Inventory CRUD, POS, Orders, Reports, Settings — no regressions.

---

## Phase 6: Test Thoroughly

**Goal:** Full regression and offline-specific tests before enabling for more users.

| # | Task | Notes |
|---|------|--------|
| 6.1 | Run full test suite | `npm run test` and `npm run test:e2e` (if applicable). Fix any failures. |
| 6.2 | Manual regression | Test all roles (e.g. admin, manager, cashier): login, Dashboard, Inventory (list, add, edit, delete, filters, search), POS, Orders, Reports, Settings, Admin & logs. |
| 6.3 | Offline scenario | With flag on: go offline, add product, edit, delete; go online; trigger sync; confirm server state and no duplicate/missing data. |
| 6.4 | Conflict scenario | Two clients: one online, one offline; edit same product; bring offline client online; resolve conflict; confirm final state. |
| 6.5 | Quota / failure | Simulate IndexedDB unavailable or quota exceeded; confirm fallback and user message; no crash. |

**Testing criteria:**

- [ ] All automated tests pass.
- [ ] Regression checklist passed for all roles.
- [ ] Offline and conflict scenarios pass; sync queue and Admin dashboard reflect state correctly.
- [ ] Fallback and “Clear local data” work as designed.

---

## Phase 7: Roll Out to Remaining Components One by One

**Goal:** Switch any other product-dependent flows to the same offline source when the flag is on, without breaking anything.

| # | Task | Notes |
|---|------|--------|
| 7.1 | List dependent surfaces | e.g. Dashboard (recent products / low stock), POS product search, Reports (inventory). For each, decide: use same `useOfflineInventory()` (or shared context that reads from IDB when flag on) or keep API-only. |
| 7.2 | Switch one at a time | For each component: (a) when offline enabled, read from the same offline source (e.g. context backed by IndexedDB); (b) test that component in isolation; (c) run regression. |
| 7.3 | Preserve RBAC | Ensure permission checks (view/edit/delete) still run; offline does not bypass auth. |
| 7.4 | Document | In code or INTEGRATION_PLAN, list which routes/components use “offline product list” when flag is on. |

**Testing criteria (per component):**

- [ ] With flag on, component shows data from IndexedDB/offline source and stays in sync with Inventory mutations.
- [ ] With flag off, component unchanged (API or existing cache).
- [ ] RBAC and existing behavior preserved; no regressions.

---

## Phase 8: Enable Auto-Sync

**Goal:** Background sync runs on an interval and on reconnect, still gated by the same feature flag.

| # | Task | Files / notes |
|---|------|----------------|
| 8.1 | Enable auto-sync when flag on | In `NetworkStatusContext` and wherever `syncService.startAutoSync()` is called, ensure it is only started when `isOfflineEnabled()` is true. |
| 8.2 | Sync on reconnect | When transitioning from offline to online, call `processSyncQueue()` once; already implemented — ensure it is gated by the same flag if desired. |
| 8.3 | Interval | Default 30s; keep as-is or make configurable. |

**Testing criteria:**

- [ ] With flag on, after going online or on interval, pending queue items decrease without user clicking “Sync now.”
- [ ] With flag off, no auto-sync runs.
- [ ] No performance degradation or duplicate requests; sync success rate remains high in testing.

---

## Phase 9: Enable Service Worker

**Goal:** Service worker is registered only when offline mode is enabled (or always, but cache only used when offline flag on — choose one and document).

| # | Task | Notes |
|---|------|--------|
| 9.1 | Gate registration | In `main.tsx`, call `serviceWorkerRegistration.register(...)` only when `isOfflineEnabled()` is true (or register always for cache but document that “offline UI” is still gated by the flag). |
| 9.2 | Cache version | Ensure `public/service-worker.js` uses a cache version that is bumped on deploy (see DEPLOYMENT.md). |
| 9.3 | Update flow | Confirm “App updated - Refresh” toast and refresh flow work. |

**Testing criteria:**

- [ ] With flag on, SW registers; static assets and (if applicable) API cache behave as designed.
- [ ] With flag off, SW is not registered (or registered but offline UI not used).
- [ ] Update flow tested; no broken cache after deploy.

---

## Fallback Strategy (All Phases)

| Scenario | Action |
|----------|--------|
| IndexedDB fails to open (e.g. private mode, disabled) | Do not use IndexedDB; use API + existing cache only. Set a flag so UI does not show “offline” features for this session. Optionally show a short message: “Offline storage is not available in this browser.” |
| Quota exceeded on write | Catch QuotaExceededError; set `offline_storage_quota_exceeded`; show user message; fall back to API-only for writes; reads can still use existing IDB data until “Clear local data” is used. |
| Sync queue grows very large (e.g. >100) | Admin dashboard already shows queue length. Add monitoring/alert when queue >100 (see “Monitor after deployment”). Optionally show in-app warning and “Sync now” or “Clear failed items.” |
| User requests “Clear local data” | Settings → Admin & logs (or Data & cache): clear products + sync queue (and optionally logs). Reload from API on next load. Document that server data is unchanged. |

---

## Preserve All Existing Features

- **Do not remove API calls** in Phases 1–6. Keep both API and IndexedDB paths; choose at runtime via feature flag.
- **RBAC:** All permission checks (e.g. `hasPermission`, `ProtectedRoute`) must remain. Offline mode does not bypass them.
- **Feature flag:** `VITE_OFFLINE_ENABLED` (and optional `VITE_OFFLINE_ROLLOUT_PERCENT`) control who gets the offline path.
- **Gradual rollout:** Use rollout percentage (e.g. 10%) with a stable user/session identifier so the same user consistently gets or does not get offline mode until you increase the percentage.

---

## Testing Protocol (Summary)

- **Per phase:** Run the testing criteria listed for that phase; do not proceed until all are checked.
- **Component-level:** After integrating a component (Phase 5 and 7), test that component in both flag-on and flag-off modes; test CRUD and RBAC.
- **Regression:** After each phase, run full regression: login, all main routes, all roles, key user flows.
- **Automated:** `npm run test` and `npm run test:e2e`; fix failures before moving on.
- **Offline-specific:** Follow OFFLINE_TESTING.md for manual offline and sync scenarios.

---

## Monitor After Deployment

Once offline is enabled in production:

| Metric | Target | Action if not met |
|--------|--------|--------------------|
| Error rate | No increase in JS/API errors | Investigate; consider disabling flag or rolling back. |
| Sync queue length | Alert if >100 | Notify team; check for stuck items or server issues; consider “Clear failed” or fix backend. |
| Sync success rate | >95% (from telemetry) | Investigate failures (Settings → Admin & logs); fix validation or backend. |
| User feedback | Collect | Support channel or in-app feedback; document common issues in TROUBLESHOOTING.md. |

Use Settings → Admin & logs (sync statistics, failed items, logs) and optional backend/analytics for sync success rate and queue length.

---

## Rollback Procedure

If critical issues appear after enabling offline:

| # | Action | Details |
|---|--------|---------|
| 1 | Disable feature flag | Set `VITE_OFFLINE_ENABLED=false` and redeploy (or set rollout % to 0). All users revert to API-only. |
| 2 | Unregister service worker | In `main.tsx` or via a one-off deploy: call `serviceWorkerRegistration.unregister()`. Users may need to close all tabs to drop the SW. |
| 3 | Clear problematic IndexedDB (if needed) | If corrupted or schema mismatch, document in TROUBLESHOOTING.md how users can clear site data (Application → IndexedDB → delete database) or use in-app “Clear local data.” |
| 4 | Revert code if necessary | `git checkout pre-offline-integration` (or the tag from Step 1), build, and deploy. Use only if flag + unregister are insufficient. |
| 5 | Communicate | Inform users of temporary rollback and that they should refresh; server data is unchanged. |

---

## File Reference

| Area | Files |
|------|--------|
| Feature flag | Add `src/lib/offlineFeatureFlag.ts` (or equivalent) |
| IndexedDB | `src/db/inventoryDB.js` |
| Sync service | `src/services/syncService.js` |
| Offline hook | `src/hooks/useInventory.js` |
| Inventory UI / context | `src/contexts/InventoryContext.tsx`, `src/pages/Inventory.tsx` |
| Network & auto-sync | `src/contexts/NetworkStatusContext.tsx` |
| Service worker | `public/service-worker.js`, `src/serviceWorkerRegistration.js` |
| Admin / clear data | `src/components/settings/AdminDashboard.tsx`, Settings → Admin & logs |
| Docs | `docs/OFFLINE_ARCHITECTURE.md`, `OFFLINE_TESTING.md`, `DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md` |

---

## Checklist Summary

- [ ] **Step 1:** Branch + commit + tag backup done.
- [ ] **Step 2:** Feature flag and fallback (quota, clear data) implemented and tested.
- [ ] **Phase 1:** IndexedDB written alongside API; no UI switch yet.
- [ ] **Phase 2:** IndexedDB CRUD and migration tested.
- [ ] **Phase 3:** Sync queue populated; auto-sync not started.
- [ ] **Phase 4:** Manual sync and conflict tested.
- [ ] **Phase 5:** One component (e.g. Inventory list) uses offline source when flag on.
- [ ] **Phase 6:** Full regression and offline tests passed.
- [ ] **Phase 7:** Remaining components switched one by one.
- [ ] **Phase 8:** Auto-sync enabled when flag on.
- [ ] **Phase 9:** Service worker enabled when flag on (or as chosen).
- [ ] **Monitor:** Error rate, queue length, sync success rate and user feedback in place.
- [ ] **Rollback:** Procedure documented and tested (flag off + unregister).

Do not skip phases. If the codebase already has offline code (e.g. useInventory, syncService), treat this plan as the **safe rollout and verification** process: ensure feature flag and fallbacks are in place, then validate each phase against the criteria above.
