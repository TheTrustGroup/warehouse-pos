# Phase 2 — P2 (Medium Priority) Fixes

**Basis:** Phase 1 Pentagon Audit (docs/PHASE1_PENTAGON_AUDIT_REPORT.md).  
**Scope:** Address P2 findings 8–17 (P2#15 covered by P1 logout).

---

## Completed in this phase

| # | Finding | Fix |
|---|---------|-----|
| **8** | Deliveries and Sales History use raw fetch | DeliveriesPage: load via `apiGet`, update status via `apiPatch`. SalesHistoryPage: void via `apiPost`, clear-sales via `apiPost`. All use apiClient (timeouts, retries, circuit breaker). |
| **10** | Auth tries /admin/api/me first | `checkAuthStatus` now calls `/api/auth/user` only. Removes extra 404 and round-trip. |
| **11** | Production build keeps console | `vite.config.ts`: `terserOptions.compress.drop_console: true`. |
| **12** | SalesHistoryPage warehouse list hardcoded | Uses `useWarehouse()`; dropdown from `warehouses` (GET /api/warehouses). Fallback to same two IDs when context not yet loaded. Selection syncs with global `currentWarehouseId`. |
| **17** | No 429 message in apiClient | On 429, error message set to "Too many requests; please wait a moment." |

---

## Optional follow-ups (completed)

| # | Finding | Fix |
|---|---------|-----|
| **9** | Session expiry during charge | On 401 during POS charge, cart is saved to sessionStorage. After re-login, POS shows a banner "Your cart was saved when your session expired. Restore it?" with Restore / Dismiss. |
| **13** | No rate limiting on login | Added `lib/ratelimit.ts` and `@upstash/ratelimit`. POST /api/auth/login is limited to 10 requests per 60 s per client IP (when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set). Returns 429 with code RATE_LIMITED when exceeded. |
| **16** | Error response shape | Login route now uses `jsonError()` from `lib/apiResponse.ts` (returns `{ error: string, code?: string }`). Client already reads `body?.error ?? body?.message`. |

## Deferred

| # | Finding | Note |
|---|---------|------|
| **14** | npm audit high/critical | Remaining issues require `npm audit fix --force` (e.g. Vite 7). Run `npm audit` and apply safe fixes; treat major upgrades separately. |

---

## Verification

- `npm run test`: 114 tests passing.
- Build: `npm run build` and `npm run build:server` (run after changes).

Commit and push from `warehouse-pos/` per ENGINEERING_RULES.md.
