# "Fetch API cannot load … due to access control checks" and Keeping Front–Back Communication Reliable

**Principal-engineer perspective: what the error means, how to fix it, and how to keep communication active.**

---

## 1. What "Fetch API cannot load … due to access control checks" means

The browser is **blocking** the response to your `fetch()` request for security reasons. It does **not** mean the network is down or the server didn’t respond.

- **“Access control checks”** = **CORS** (Cross-Origin Resource Sharing).
- The **origin** is where the page runs (e.g. `https://warehouse.extremedeptkidz.com`). The **API** might be on another host (e.g. `https://warehouse-pos-8ag8.vercel.app`). That’s **cross-origin**.
- For cross-origin requests, the **server must** send `Access-Control-Allow-Origin` (and related headers) that **allow your frontend’s origin**. If it doesn’t, or the origin isn’t allowed, the browser hides the response and reports this error.
- The same CORS error can appear when the server returns **401/403/500** but the response is missing CORS headers, so the browser never lets the page see the body and surfaces “access control checks” instead of “Unauthorized” or “Server error”.

So in practice:

- **Fix CORS** so every response (including errors) from the API includes the right `Access-Control-*` headers for your frontend origin.
- **Same-origin** (frontend and API on the same domain) avoids CORS entirely and is the most robust setup when you control both.

---

## 2. Fixing the CORS / “access control checks” error

### A. Ensure the frontend origin is allowed on the API

The API (inventory-server) uses `inventory-server/lib/cors.ts`:

- Allowed origins: `warehouse.extremedeptkidz.com`, `warehouse.hunnidofficial.com`, localhost variants, plus `ALLOWED_ORIGINS` from env.
- Allowed hostname suffixes: `vercel.app`, `extremedeptkidz.com`, `hunnidofficial.com`, plus `ALLOWED_ORIGIN_SUFFIXES` from env.

So:

- If the app runs at **`https://warehouse-pos-8ag8.vercel.app`** or any **`*.vercel.app`**, it’s already allowed by suffix.
- If you use a **custom domain** (e.g. `https://app.example.com`), add it:
  - **Vercel (API project)** → Settings → Environment Variables:
  - `ALLOWED_ORIGINS` = `https://app.example.com` (comma-separated if you have several), **or**
  - `ALLOWED_ORIGIN_SUFFIXES` = `example.com` so any `*.example.com` is allowed.
- Redeploy the API after changing env so new CORS config is applied.

### B. Prefer same-origin in production

- Set **`VITE_API_BASE_URL`** to **empty string** (`""`) for the **production** frontend build when the frontend and API are served from the **same** Vercel project (e.g. same domain and path `/api/...`). Then all requests are same-origin and CORS is not involved.
- If the frontend is on one domain (e.g. `warehouse.extremedeptkidz.com`) and the API on another (e.g. `warehouse-pos-8ag8.vercel.app`), keep CORS configured as above and ensure **every** response (including 4xx/5xx) is sent with CORS headers (this codebase uses `withCors` on responses; keep that pattern on all routes and error paths).

### C. Check auth and error paths

- If the API returns **401 Unauthorized** without CORS headers, the browser will show “access control checks” instead of “Unauthorized”. Ensure **all** responses from API routes (including auth failures) go through the same CORS helper (e.g. `withCors(res, req)`).
- In this repo, products route and others use `withCors`; any new route or error path must do the same.

---

## 3. Keeping front–back communication “always active” (principal-engineer recommendations)

### 3.1 Architecture and deployment

| Recommendation | Why |
|----------------|-----|
| **Same-origin when possible** | One domain for app + API (e.g. `/api/*` on same host). No CORS, fewer moving parts, cookies work simply. |
| **Single API base URL** | All clients use `API_BASE_URL` from one place (e.g. `src/lib/api.ts`). No hardcoded hosts; env drives behaviour. |
| **Health endpoint** | `GET /api/health` (or `/api/health/ready`) that returns 200 when the app and DB are usable. Use it for readiness checks and monitoring. |

### 3.2 Resilience (already in this codebase)

| Mechanism | Purpose |
|-----------|--------|
| **Circuit breaker** | After repeated failures, stop hammering the API and show “server temporarily unavailable” instead of many failed requests. |
| **Retries with backoff** | For GET (and optionally safe operations), retry on 5xx/timeout so transient failures don’t look like “always down”. |
| **Timeouts** | Request timeout (e.g. 45s) so the UI doesn’t hang; server-side timeouts return 503 with a clear message. |
| **Clear error messages** | Differentiate 401 (session/reauth), 5xx (server), timeout (retry), CORS (config). |

### 3.3 Operational practices

| Practice | Action |
|----------|--------|
| **Monitor** | Use Vercel (or your host) logs and, if available, Sentry for 4xx/5xx and timeouts. Alert on repeated 5xx or health-check failures. |
| **Health checks** | Frontend or a simple cron can call `GET /api/health` periodically; if it fails, show “Server unavailable” and a Retry button (as you do today). |
| **Env and deploy** | Keep `VITE_API_BASE_URL` (and API’s `ALLOWED_ORIGINS` / `ALLOWED_ORIGIN_SUFFIXES`) in sync with actual frontend URL and redeploy both when domains change. |
| **Runbook** | Document: “Fetch / CORS error” → check frontend origin vs `ALLOWED_ORIGINS`/suffixes; “Server unavailable” → check API logs, health, DB. |

### 3.4 WebSocket / Realtime

The console error about **WebSocket connection to Supabase Realtime failed** is separate from the Fetch/CORS error:

- It means the **browser lost (or never established) the WebSocket** to Supabase (e.g. `wss://...supabase.co/realtime/v1/websocket`).
- Causes: network drop, firewall/proxy blocking WebSockets, Supabase limits, or client going to sleep. The app should treat Realtime as **optional**: list and mutations work via REST; Realtime is for live updates. If the socket fails, the UI should still work and retry or reconnect when possible (e.g. on focus or after a delay).

---

## 4. Quick checklist when you see “Fetch API cannot load … access control checks”

1. **Confirm frontend origin** (address bar when the error happens). Is it exactly one of the allowed origins or does its hostname match an allowed suffix?
2. **Confirm API CORS config**: `ALLOWED_ORIGINS` / `ALLOWED_ORIGIN_SUFFIXES` on the API (Vercel env) and that the API is redeployed after changes.
3. **Try same-origin**: If frontend and API can be on the same domain, set `VITE_API_BASE_URL=""` and redeploy so requests are same-origin.
4. **Check Network tab**: Inspect the failing request; if it’s preflight (OPTIONS), ensure the API responds with 204 and CORS headers. If it’s the actual GET/POST, ensure the response (including 401/500) has `Access-Control-Allow-Origin` and related headers.

---

## 5. References in this repo

- CORS: `inventory-server/lib/cors.ts`
- API base URL: `src/lib/api.ts`
- Circuit breaker: `src/lib/circuit.ts`
- Server stability: `docs/SERVER_STABILITY_AND_AVAILABILITY.md`
