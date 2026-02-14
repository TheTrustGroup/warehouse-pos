# Load Faster & Reliability (Post-Login)

## Implemented (top-engineer stack)

- **Timeout retries**: All API calls through `apiClient` retry on timeout and network errors on every route (Dashboard, Inventory, Orders, POS, etc.).
- **`GET /api/health`**: Minimal health route in `inventory-server` (no auth). Used for warmup and cron keep-alive.
- **API warmup**: `CriticalDataContext` fires `GET /api/health` in phase 1 so serverless can wake before heavier requests.
- **Two-phase critical load**: Phase 1 = warmup + stores + warehouses; phase 2 = products + orders. Scope loads first; inventory/orders benefit from a warmer server.
- **Longer initial timeout**: First load after login uses `INITIAL_LOAD_TIMEOUT_MS` (35s) for stores, warehouses, products, and orders to absorb cold start.
- **Prefetch after login**: On successful login, a fire-and-forget `GET /api/health` runs before `navigate()` so the server starts waking while the user is still on the login screen.
- **Stale-while-revalidate indicator**: Inventory page shows a subtle "Updating…" bar when a background (silent) refresh is in progress (`isBackgroundRefreshing` from `InventoryContext`).
- **Vercel Cron keep-warm**: `inventory-server/vercel.json` includes a cron that hits `/api/health` every 5 minutes. (Vercel Cron may require a paid plan; if unavailable, remove the `crons` entry or use an external cron service.)
- **Cache-first**: Inventory still shows cached products immediately and refreshes in the background.

## Optional next steps

- **Vercel Pro**: Longer keep-warm / concurrency so instances stay warm longer.
- **External cron**: If Vercel Cron is not available, use a third-party cron (e.g. cron-job.org) to call `https://your-api-domain.com/api/health` every 5 minutes.

## Summary

- **Fix coverage**: Timeout retries apply to **all** data loads after login.
- **Faster first load**: Health endpoint, warmup, two-phase load, longer initial timeout, prefetch after login, and cron keep-warm are in place. "Updating…" indicates background refresh on Inventory.
