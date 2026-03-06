# Phase 3 — P3 (Enhancement) Fixes

**Basis:** Phase 1 Pentagon Audit, P3 findings 18–24.  
**Scope:** Low-priority / enhancements; improve robustness, UX, and observability.

---

## P3 findings (audit)

| # | Finding | Effort | Status |
|---|---------|--------|--------|
| 18 | VITE_API_BASE_URL validate at runtime (empty/invalid) | XS | Done |
| 19 | POS product cache TTL (30s); document or invalidate on focus | S | Done |
| 20 | Reports: show banner when API 404/5xx ("from local data") | XS | Done |
| 21 | Large component files (split InventoryContext, AuthContext, POSPage) | L | Deferred |
| 22 | E2E for POS flow in CI | S | Done |
| 23 | Health readiness (DB/cache check, 503 if unhealthy) | S | Done |
| 24 | Document deliveries = sales with delivery_status | M (if API) | Done |

---

## Implemented

- **18:** In production, non-empty `VITE_API_BASE_URL` is validated with `new URL()`; invalid URL throws a clear error at load.
- **19:** POS product list is cached for 30s (`PRODUCTS_CACHE_TTL_MS`). On `visibilitychange` to visible, cache is cleared and a silent refetch runs so returning to the tab gets fresh stock.
- **20:** Reports page tracks `serverReportUnavailable`. When sales report or transactions API fails (404/5xx or throw), a banner is shown: "Report is from local data; server report unavailable."
- **22:** `.github/workflows/ci.yml` runs on push/PR to main: job `unit-and-build` (npm ci, npm run ci), job `e2e` (Playwright chromium, npm run test:e2e).
- **23:** GET `/api/health/ready` checks DB (Supabase `sales` query) and optional Redis (Upstash ping); returns 200 when healthy, 503 with `{ status, db, redis? }` when not.
- **24:** `docs/DELIVERIES_MODEL.md` documents that deliveries = sales with delivery_status; API uses GET/PATCH /api/sales.

---

## Deferred / optional

- **21:** Split large files (L effort); do as a dedicated refactor.
