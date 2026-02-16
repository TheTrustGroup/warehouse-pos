# Troubleshooting Guide

This guide covers common issues, how to clear data, force resync, browser compatibility, and a short FAQ. It is written for support staff and developers.

---

## Table of Contents

1. [Common Issues and Solutions](#common-issues-and-solutions)
2. [Clearing IndexedDB Manually](#clearing-indexeddb-manually)
3. [Force Resync](#force-resync)
4. [Browser Compatibility](#browser-compatibility)
5. [FAQ](#faq)

---

## Common Issues and Solutions

### "Product saved but doesn’t appear on another device"

- **Cause:** The other device is reading from the server; the first device may still have changes only in the **sync queue** (e.g. offline or sync failed).
- **What to do:**
  1. On the device where you added/edited: ensure it’s **online** and wait for sync (or use **Sync now** in the sync bar or Settings → Admin & logs).
  2. Check **Settings → Admin & logs**: look at "Failed sync items". If the item is there, read the error and fix (e.g. validation, 409 conflict), then **Sync now** or **Clear failed items** if appropriate.
  3. On the other device: refresh or reopen the app so it fetches the latest list from the server.

### "Sync stuck" or "Pending forever"

- **Cause:** Network issues, server errors (5xx), or 4xx (e.g. validation) that don’t get resolved.
- **What to do:**
  1. Check network: DevTools → Network, try **Sync now** and see if requests succeed.
  2. Open **Settings → Admin & logs**: check "Failed sync items" and the error message. Fix the cause (e.g. fix data, fix server), then use **Sync now** or **Retry** (if the UI offers it) or **Clear failed items** to remove items that should no longer be retried.
  3. If the server was down, going back online and waiting (or Sync now) will retry pending items (up to 5 attempts with backoff).

### "Conflict" modal keeps appearing

- **Cause:** The same product was changed offline on this device and also on the server (or another device). The server returns 409 and the app shows the conflict modal.
- **What to do:** Choose **Keep local**, **Keep server**, or **Merge** as appropriate. To avoid future prompts for similar cases, set **Conflict resolution** in Settings to **Last write wins** (Settings or Data & cache / Admin area, if available). Note: last-write-wins uses local `lastModified` vs server `updatedAt` to pick the newer version automatically.

### "Sync worked for first 2 items, then Load failed" / products don’t save or show

- **Cause:** The browser reports **"Load failed"** when the request never completes. Common reasons:
  1. **Request body too large** – Products with large base64 images can push the POST body over the server limit (e.g. Vercel 4.5MB). The first products may have had no/small images; later ones with images then fail.
  2. **CORS** – The server must allow `POST` from `https://warehouse.extremedeptkidz.com` (see `SERVER_SIDE_FIX_GUIDE.md`). If only GET works, POST can still show "Load failed".
  3. **Network / timeouts** – Unstable connection or server taking too long.
- **What we did:** The sync service now **omits large images** from the sync payload (keeps only small ones, up to 5 images) so the body stays under typical limits. Product metadata still syncs; you can add images again via Edit after sync.
- **What to do:**
  1. **Retry all** (or retry each item) in the Sync queue. Retry all now resets failed items to pending and runs sync again.
  2. **Brave browser:** If sync or "Retry all" seems to do nothing or always shows "Load failed", try: Brave Shields → set to "Standard" or "Allow all" for this site; or allow cross-site cookies for the API domain. Then click Retry all again.
  3. If it still fails: check DevTools → Network for the `POST /api/products` request. If it’s red/canceled with no response, it’s likely CORS or body size; ensure CORS allows POST and the backend body limit is sufficient.
  4. Backend logs: check for 413 (payload too large) or CORS preflight failures.

### "Server is temporarily unavailable" or "Using last saved data"

- **Cause:** The API client’s **circuit breaker** has opened after repeated failures (e.g. server down, timeouts).
- **What to do:** Wait a minute and try again. Ensure the backend is up and reachable (try `/api/health` in the browser). When the server is healthy again, the circuit will eventually close and requests will resume.

### Blank screen or "Something went wrong"

- **Cause:** Uncaught JavaScript error or failed chunk load (e.g. after deploy).
- **What to do:**
  1. Hard refresh (Ctrl+F5 / Cmd+Shift+R). If a new version was deployed, the service worker may need to activate (refresh again if prompted).
  2. Clear site data for the app origin (see [Clearing IndexedDB](#clearing-indexeddb-manually)) and reload. If the issue persists, check the browser console and any error reporting (e.g. Sentry) for stack traces.

### Login fails or session lost

- **Cause:** Wrong credentials, server down, or session/cookie expired.
- **What to do:** Verify credentials and that the auth API is up (`/admin/api/me` or `/api/auth/user`). If using cookies, ensure same-site/cors and credentials are correct. Clear cookies/localStorage for the site and log in again if needed.

---

## Clearing IndexedDB Manually

Clearing IndexedDB removes **all local products and the sync queue** for this app. Use only when you need a full reset (e.g. corruption or testing). The server is not modified.

### Chrome / Edge

1. Open DevTools (F12).
2. Go to **Application** (or **Storage** in Edge).
3. Under **Storage** → **IndexedDB**, find:
   - **ExtremeDeptKidzDB** (products, syncQueue, metadata)
   - **WarehousePOSLogsDB** (logs, telemetry)
4. Right‑click the database → **Delete database**.
5. Reload the app.

### Firefox

1. Open DevTools (F12).
2. Go to **Storage** tab.
3. Under **Indexed DB**, expand the origin and the database name.
4. Right‑click the database → **Delete "ExtremeDeptKidzDB"** (and optionally **WarehousePOSLogsDB**).
5. Reload the app.

### Safari

1. Develop → **Show Web Inspector** (or Enable Develop menu in Preferences).
2. **Storage** tab → **Indexed Databases**.
3. Select the database and delete it (or use **Safari → Clear History** and choose to clear website data for the site).
4. Reload the app.

**After clearing:** The app will have no local products or queue. It will load products from the server again on next open. Pending changes that were only in the queue are **lost** unless they had already synced.

---

## Force Resync

To force the app to try syncing again:

1. **Ensure you’re online** (Wi‑Fi/cellular on, or DevTools Network not set to Offline).
2. **Manual sync:**
   - Use the **Sync** control in the sync status bar (if visible), or  
   - Go to **Settings → Admin & logs** and click **Sync now**.
3. **Retry failed items:** In **Admin & logs**, if there are "Failed sync items", fix the underlying issue (e.g. validation, server), then click **Sync now**. Optionally use **Clear failed items** only for items you no longer want to retry.
4. **Full reload:** Refresh the page (or reopen the app). Auto-sync runs periodically (e.g. every 30 seconds) and also when coming back online; a reload ensures the sync logic is running with a fresh connection.

You cannot "force the server to resend data" from this doc; the client **pulls** (GET) or **pushes** (POST/PUT/DELETE) via the API. "Force resync" here means: force the **client** to run the sync queue and/or reload data from the server.

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari (desktop) | Safari (iOS) | Edge |
|--------|--------|---------|-------------------|--------------|------|
| IndexedDB | Yes | Yes | Yes | Yes | Yes |
| Service worker | Yes | Yes | Yes | Yes (iOS 11.3+) | Yes |
| Backdrop-filter (glass) | Yes | Yes | Yes | Yes (iOS 14+) | Yes |
| Optional chaining / modern JS | Yes | Yes | Yes (14+) | iOS 14+ | Yes |

- **Older Safari / iOS:** If you need to support very old versions, test IndexedDB and service worker; the app may use legacy bundles (e.g. Vite legacy plugin). Reduce blur or disable glass on low-end devices if needed.
- **Private / Incognito:** IndexedDB and localStorage may be cleared when the session ends; users may "lose" local-only data after closing the window.
- **Enterprise / locked-down browsers:** Some policies block IndexedDB or service workers; the app may fall back to in-memory or show errors. Check console and network.

---

## FAQ

**Q: Where is data stored?**  
- **Products and sync queue:** IndexedDB (database name **ExtremeDeptKidzDB**).  
- **Logs and telemetry:** IndexedDB (**WarehousePOSLogsDB**).  
- **Session/auth:** localStorage and/or cookies (depending on backend).  
- **Server:** The backend at `VITE_API_BASE_URL` is the source of truth once sync succeeds.

**Q: Can I use the app fully offline?**  
- Yes for **viewing and editing** products that are already loaded: the UI reads/writes IndexedDB and the sync queue. Creating/editing/deleting will sync when back online. Some features (e.g. loading orders, reports) may require the server.

**Q: What happens if I clear the sync queue?**  
- **Clear failed items:** Only failed queue entries are removed; pending ones keep syncing.  
- **Clear entire queue** (e.g. via code or DB delete): Pending changes that haven’t synced yet will never be sent; local product rows may stay with `syncStatus: 'pending'` until you fix and re-enqueue or reset.

**Q: How do I export data for debugging?**  
- **Settings → Admin & logs:** Export **Sync queue** as JSON and **Logs** as JSON. Use these for support or debugging without sharing live credentials.

**Q: The app says "Working offline". How do I go back online?**  
- Turn Wi‑Fi or cellular back on, or in DevTools → Network set throttling to "Online". The app uses `navigator.onLine` and will show "Back online" and trigger a sync automatically.

**Q: How do I enable debug mode?**  
- Add **?debug=true** to the URL (e.g. `/inventory?debug=true`). A floating debug panel appears with logs, network, and IndexedDB summary (see app docs or OFFLINE_TESTING.md).

For more on offline behavior and testing, see **OFFLINE_ARCHITECTURE.md** and **OFFLINE_TESTING.md** (repo root).
