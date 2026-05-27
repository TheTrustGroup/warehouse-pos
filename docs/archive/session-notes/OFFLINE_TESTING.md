# Offline Functionality – Manual Test Checklist

Use this checklist to validate offline-first behavior. Record results in [OFFLINE_TEST_REPORT.md](./OFFLINE_TEST_REPORT.md).

---

## Prerequisites

- Backend API running (e.g. `inventory-server` or configured `VITE_API_BASE_URL`)
- App built or running: `npm run dev`
- Chrome DevTools (or similar) for network toggling

---

## Test Scenario 1: Create Product Offline

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 1.1 | Turn off WiFi (or DevTools → Network → Offline) | App shows offline indicator / "Working offline" | ☐ |
| 1.2 | Navigate to Inventory → Add new product | Product form opens | ☐ |
| 1.3 | Fill all fields (name, SKU, category, price, quantity, etc.) and save | Form submits without error | ☐ |
| 1.4 | Verify product appears in list immediately | New product visible in table/grid | ☐ |
| 1.5 | Verify sync badge shows "pending" (or ⟳ / unsynced state) | Badge indicates pending sync | ☐ |
| 1.6 | Turn WiFi back on | Network indicator shows online | ☐ |
| 1.7 | Wait for automatic sync (up to 30 seconds) | Sync status bar shows "Syncing…" then "All changes synced ✓" | ☐ |
| 1.8 | Verify badge changes to "synced" (✓) | Product badge shows synced | ☐ |
| 1.9 | Verify product has `serverId` from backend (e.g. inspect in Sync queue or API) | Product has server ID; queue item removed | ☐ |

---

## Test Scenario 2: Edit Product Offline

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 2.1 | Turn off WiFi | Offline state active | ☐ |
| 2.2 | Edit an existing product (change name, price, or quantity) and save | Changes save without error | ☐ |
| 2.3 | Verify changes visible immediately in list | UI shows updated values | ☐ |
| 2.4 | Verify sync badge shows pending | Badge indicates pending | ☐ |
| 2.5 | Turn on WiFi | Online | ☐ |
| 2.6 | Wait for sync | Sync completes | ☐ |
| 2.7 | Verify server has updated data (e.g. reload from server or check API) | Backend reflects edits | ☐ |

---

## Test Scenario 3: Delete Product Offline

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 3.1 | Turn off WiFi | Offline | ☐ |
| 3.2 | Delete a product from the list | Delete confirmation (if any) and then product removed from list | ☐ |
| 3.3 | Verify product no longer in list | Product not visible | ☐ |
| 3.4 | Verify sync queue has DELETE entry (e.g. open Sync queue modal) | Queue shows delete operation for that product | ☐ |
| 3.5 | Turn on WiFi | Online | ☐ |
| 3.6 | Wait for sync | Sync completes | ☐ |
| 3.7 | Verify deletion synced to server (product gone or 404 from API) | Server no longer returns product | ☐ |

---

## Test Scenario 4: Conflict Resolution

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 4.1 | Open app on Device A (or Tab A) – online | App loaded, products visible | ☐ |
| 4.2 | Open app on Device B (or Tab B in incognito / different profile) – take offline | Same product list (or ensure same product exists) | ☐ |
| 4.3 | On Device A: edit a product (e.g. change name) and save | Saved and synced | ☐ |
| 4.4 | On Device B (offline): edit the same product (different change) and save | Saved locally, pending sync | ☐ |
| 4.5 | Bring Device B online and trigger sync (or wait for auto-sync) | Sync runs; server returns 409 or conflict detected | ☐ |
| 4.6 | Verify conflict modal appears with local vs server | ConflictModal shows side-by-side comparison | ☐ |
| 4.7 | Test "Keep Local" | Local version pushed to server; queue cleared | ☐ |
| 4.8 | Repeat conflict setup; test "Keep Server" | Local DB updated from server; queue cleared | ☐ |
| 4.9 | Repeat conflict setup; test "Merge Manually" | Editable form; merged payload sent; queue cleared | ☐ |
| 4.10 | Repeat conflict setup; test "Last write wins" | Newer version wins; queue cleared | ☐ |

---

## Test Scenario 5: App Closed / Refresh

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 5.1 | Turn off WiFi | Offline | ☐ |
| 5.2 | Add one or more products offline | Products in list, pending sync | ☐ |
| 5.3 | Close browser tab or app (or refresh page) | App unloads | ☐ |
| 5.4 | Reopen app (same URL) | App loads | ☐ |
| 5.5 | Verify products still visible (from IndexedDB) | Products appear without network | ☐ |
| 5.6 | Turn on WiFi | Online | ☐ |
| 5.7 | Verify sync resumes automatically (within ~30 s) | Sync runs; badges turn synced | ☐ |

---

## Test Scenario 6: Bulk Operations

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 6.1 | Turn off WiFi | Offline | ☐ |
| 6.2 | Add ~50 products offline (use form or script if available) | All 50 appear in list; queue has 50 CREATEs | ☐ |
| 6.3 | Turn on WiFi | Online | ☐ |
| 6.4 | Verify sync starts and progresses | Sync status bar shows "Syncing N…" | ☐ |
| 6.5 | Verify all 50 sync without timeout / failure | All items synced or clear error handling | ☐ |
| 6.6 | Monitor sync progress indicator | Progress updates (e.g. count or %) | ☐ |
| 6.7 | Verify queue empty and all products have serverId | No pending items; products synced | ☐ |

---

## Test Scenario 7: Network Instability

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 7.1 | Open Chrome DevTools → Network → Throttling: "Slow 3G" | Latency and slow throughput | ☐ |
| 7.2 | Add or edit products | Requests may be slow or time out | ☐ |
| 7.3 | Verify graceful handling (no uncaught errors, UI shows pending/retry) | No crash; queue holds items; user sees status | ☐ |
| 7.4 | Verify retry logic: failed items stay in queue and retry on next sync | Failed count/retry visible; next sync retries | ☐ |
| 7.5 | Switch to "Online" and verify sync eventually succeeds | Pending items sync | ☐ |

---

## Cross-Browser & Environment

| Browser / Environment | IndexedDB | Service Worker | Offline Create | Sync After Online | Pass/Fail |
|-----------------------|-----------|-----------------|----------------|-------------------|-----------|
| Chrome (desktop)      | ☐         | ☐               | ☐              | ☐                 | ☐         |
| Chrome (mobile)      | ☐         | ☐               | ☐              | ☐                 | ☐         |
| Safari (desktop)      | ☐         | ☐               | ☐              | ☐                 | ☐         |
| Safari (iOS)          | ☐         | ☐               | ☐              | ☐                 | ☐         |
| Firefox               | ☐         | ☐               | ☐              | ☐                 | ☐         |
| Edge                  | ☐         | ☐               | ☐              | ☐                 | ☐         |

---

## Performance (Manual Targets)

| Metric | Target | How to Measure | Result |
|--------|--------|----------------|--------|
| Time to add one product offline | &lt; 100 ms (UI feels instant) | DevTools Performance or user perception | ☐ |
| Time to add 100 products offline | &lt; 15 s total | Batch add + note time | ☐ |
| Sync 100 products to server | Depends on network; no UI freeze | Monitor sync bar; UI remains responsive | ☐ |
| IndexedDB query (get all products) | &lt; 100 ms for 1k items | Console: `performance.now()` around `getAllProducts()` | ☐ |

---

*After running each scenario, update [OFFLINE_TEST_REPORT.md](./OFFLINE_TEST_REPORT.md) with pass/fail and notes.*
