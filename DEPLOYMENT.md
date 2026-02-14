# Production Deployment Checklist

Use this checklist before and after deploying the Warehouse POS app to production.

---

## 1. Service Worker

- [ ] **Cache version:** Bump `CACHE_VERSION` in `public/service-worker.js` on each production deploy (e.g. to 3, 4, …). Old caches are deleted on activate.
- [ ] **Update flow:** Verify that after deploy, opening the app shows "App updated - Refresh to see changes" (or similar) and that after refresh the new build loads. The SW uses `skipWaiting()` and `clients.claim()`; clients receive `SW_UPDATED` and can show a toast.
- [ ] **Cache eviction:** Current strategy is version-based: new version = new cache names; previous caches are removed in the `activate` handler. No runtime size/age eviction (optional: add Workbox ExpirationPlugin if needed).

---

## 2. Build Optimization

- [ ] **Production build:** Run `npm run build` (uses `mode: 'production'`). Do not deploy dev builds.
- [ ] **Minify:** JS and CSS are minified by default (Vite esbuild). No extra config required.
- [ ] **Images:** Prefer WebP for images. Convert assets to WebP at build or upload time; the service worker caches `.webp`. For dynamic images from CMS/API, ensure the server can serve WebP when supported.
- [ ] **Tree-shaking:** Unused code is tree-shaken by Rollup. Avoid side-effectful imports that pull in large libraries.
- [ ] **Code splitting:** Routes are lazy-loaded (`lazyWithRetry`). Manual chunks: `react-vendor`, `chart-vendor`, `ui-vendor`, `db-vendor`, `motion-vendor`, and per-page chunks (dashboard, inventory-reports, pos, orders, settings).
- [ ] **Lazy load:** Non-critical components are loaded on demand via React.lazy + retry. Confirm chunk names in build output and that no single chunk is excessively large (adjust `chunkSizeWarningLimit` or split further if needed).

---

## 3. IndexedDB

- [ ] **Migrations:** The app uses Dexie with a version chain (`version(1)`, `version(2)` with upgrade). For future schema changes, add `version(3).stores(...).upgrade(tx => { ... })` in `src/db/inventoryDB.js` and test upgrade from v2.
- [ ] **Upgrade testing:** Before releasing a new version that bumps DB version, test in a browser that already has data (v1 or v2); confirm open and read/write work.
- [ ] **Backup/restore:** Users can export/import from Settings → Admin & logs → Backup & restore. Export produces a JSON backup; restore supports "replace" (clear then restore) or "merge".

---

## 4. Security

- [ ] **Sensitive data in IndexedDB:** Product and sync data are not encrypted at rest. If you need to encrypt sensitive fields, add encryption before `db.products.add`/`put` and decryption on read (e.g. AES-GCM with a key derived from user secret). Document key management.
- [ ] **Input validation:** All user inputs (login, product form, etc.) are validated with Zod (see `src/lib/validationSchemas.ts`). Keep schemas strict and reject invalid payloads.
- [ ] **Sanitization:** Use `escapeHtml()` from `src/lib/sanitize.ts` for any user-generated text rendered in the DOM. Avoid `dangerouslySetInnerHTML` with raw user content; for rich HTML use a sanitizer like DOMPurify.
- [ ] **CSRF:** If the API uses cookie-based auth, ensure the backend has CSRF protection (e.g. same-site cookies, CSRF tokens). The frontend sends `credentials: 'include'` where needed; document backend CSRF requirements.
- [ ] **HTTPS only:** Serve the app and API over HTTPS only. Redirect HTTP → HTTPS at the host or CDN. Set `Strict-Transport-Security` and secure cookies where applicable.

---

## 5. Monitoring

- [ ] **Error tracking:** Optional Sentry (or similar). Set `VITE_SENTRY_DSN` and wire `reportError` in `main.tsx` to `Sentry.captureException`. Respect user consent (Settings → Admin & logs → "Send error reports to server").
- [ ] **Performance:** Optional performance monitoring (e.g. Sentry, Web Vitals). Add a small script to measure LCP, FID, CLS and send to your backend or analytics.
- [ ] **Health check:** The app pings `VITE_HEALTH_URL` (e.g. `GET /api/health`) when set. Ensure the backend exposes a liveness endpoint and that it is monitored.
- [ ] **Sync queue length:** Monitor via Settings → Admin & logs (pending/failed counts). Optionally log or send queue length to your backend for alerting when it grows abnormally.

---

## 6. User Onboarding

- [ ] **First-time tutorial:** The onboarding modal (see `OnboardingModal.tsx`) shows once per device (localStorage key `warehouse_onboarding_seen`). It explains offline use, sync status, and links to help.
- [ ] **Help link:** Update the help URL in `OnboardingModal.tsx` (`HELP_URL`) to your docs or repo (e.g. `docs/TROUBLESHOOTING.md` or your docs site).
- [ ] **Sync status:** Users are directed to the sync bar and Settings → Admin & logs to check sync status.

---

## 7. Rollback Plan

- [ ] **Disable offline mode:** To effectively "disable" offline behavior: (1) Do not register the service worker (comment out or gate `serviceWorkerRegistration.register()` in `main.tsx`), and (2) In the API client, you can short-circuit or fail when offline so the UI always requires network. IndexedDB will still hold data; the app will just not rely on it for offline CRUD if you change the context to always fetch from server. Document the exact steps for your team.
- [ ] **Previous version:** Keep the previous production build artifact (e.g. in CI or a `releases/` folder) so you can redeploy it quickly. Tag releases in git.
- [ ] **Data migration:** If a rollback involves an older app version that expects an older IndexedDB schema, users may need to clear site data or run a one-time migration. Document in TROUBLESHOOTING.md and release notes.

---

## 8. Browser Requirements

- [ ] **Compatibility check:** The app shows a full-screen message for unsupported browsers (see `BrowserCheck.tsx`). Minimum: Chrome 87+, Safari 14+, Firefox 78+, Edge 87+. Requires IndexedDB and Service Worker.
- [ ] **Upgrade message:** Users on older browsers see "Browser not fully supported" and can choose "Get Chrome" or "Continue anyway". "Continue anyway" is stored so the message does not reappear.

---

## Pre-deploy Commands

```bash
# Install deps and run tests
npm ci
npm run test
npm run build

# Preview production build locally
npm run preview
```

---

## Environment Variables (Production)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Full API base URL (e.g. `https://api.example.com`). Build fails if unset in production. |
| `VITE_HEALTH_URL` | No | Health check URL (e.g. same as API + `/api/health`). |
| `VITE_SENTRY_DSN` | No | Sentry DSN for error tracking (wire in main.tsx when set). |

---

## Post-deploy Verification

- [ ] Load the app in a supported browser (Chrome/Safari/Firefox/Edge).
- [ ] Log in and confirm dashboard/inventory load.
- [ ] Turn off network (DevTools → Offline), add a product, turn network back on, confirm sync (see OFFLINE_TESTING.md).
- [ ] Open Settings → Admin & logs; confirm sync stats, queue, logs, and backup/restore work.
- [ ] Confirm service worker update: deploy a small change, reopen app, accept refresh prompt, verify new version.

---

## Quick Reference

| Doc | Purpose |
|-----|---------|
| `docs/OFFLINE_ARCHITECTURE.md` | Offline and sync design |
| `docs/API_INTEGRATION.md` | Backend API contract |
| `docs/TROUBLESHOOTING.md` | Common issues and FAQ |
| `OFFLINE_TESTING.md` | Offline test scenarios |
