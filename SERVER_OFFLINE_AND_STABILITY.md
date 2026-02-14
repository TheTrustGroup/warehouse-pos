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

## Files involved

- **Circuit breaker**: `src/lib/circuit.ts` (threshold, cooldown), `src/lib/apiClient.ts` (when we call `recordFailure`).
- **Banner**: `src/components/layout/Layout.tsx` (debounce, show/hide, Try again / Dismiss).
- **Modal/panel opacity**: `src/styles/glassmorphism.css` (`.glass-panel`), `src/components/inventory/ProductFormModal.tsx` (opaque overlay + panel).
