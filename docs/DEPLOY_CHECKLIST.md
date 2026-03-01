# Deploy checklist (fix 500 / 404 / "Importing a module script failed")

## 1. Frontend (warehouse.extremedeptkidz.com or Vercel)

- **SPA routing:** `vercel.json` includes `rewrites: [{ "source": "/(.*)", "destination": "/index.html" }]` so paths like `/pos`, `/inventory`, `/dashboard` serve `index.html` and the client router handles them. Without this, direct visits or refresh on `/pos` return **404 NOT_FOUND**.
- **Deploy the full `dist/`** from a single `npm run build`. Do not deploy only `index.html` or only some files; hashed chunk names change every build. If the browser has old HTML pointing to old chunk names, you get **404** for assets and **"Importing a module script failed"**.
- **Performance:** Build uses `manualChunks` so Recharts loads only when the Reports page is opened (smaller initial load). Production build has `sourcemap: false` and Terser minification. API preconnect runs in `main.tsx` to reduce first-request latency.
- **Cache:** `vercel.json` sets `Cache-Control: no-store` for `/` and `/index.html` so the next request after deploy gets fresh HTML. If you use another host, set the same for the document URL.
- **Service worker:** After deploy, users may need a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or to close and reopen the tab so the new bundle (and new SW if updated) is used.

## 2. Backend API (inventory-server-iota.vercel.app)

- **CORS:** All API routes (including `GET /api/health`) attach CORS via `corsHeaders(request)`. Defaults allow **both** client frontends: `https://warehouse.extremedeptkidz.com` and `https://warehouse.hunnidofficial.com` (and suffixes `extremedeptkidz.com`, `hunnidofficial.com`). `ALLOWED_ORIGINS` / `ALLOWED_ORIGIN_SUFFIXES` are **additive only**. If you add a new route, use `corsHeaders(request)` and `withCors(response, request)`.
- **Env:** Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) in the Vercel project for the API. `/api/size-codes` now returns **200 with data: []** when DB/env is missing (no 500), so the inventory page loads even if size codes fail; the size filter may be empty until env is fixed.
- **POS → designated location:** Cashiers with exactly one row in `user_scopes` get `warehouse_id` from login and from `/api/auth/user`/`/admin/api/me`; the frontend falls back to `/api/auth/user` when the first auth response has no `warehouse_id`, so the "Select location" modal is skipped. Ensure each cashier has exactly one `user_scopes` row with the correct `warehouse_id`.
- **Redeploy** the API after changing env so the new values are in the build.

## 3. Order of operations

1. Build frontend once: `npm run build` in `warehouse-pos`.
2. Deploy **entire** `dist/` (e.g. Vercel frontend project).
3. Deploy API (inventory-server) with correct Supabase env.
4. Hard refresh or new tab when testing so no old HTML/chunks are used.
5. **Post-deploy health (mandatory):** After API deploy, verify the API is up:
   - `GET {API_URL}/api/health` must return `{ "status": "ok", ... }`.
   - From repo root: `cd inventory-server && BASE_URL={API_URL} npm run test:health` (or set `BASE_URL` in `.env.local`).
   - Or: `curl -s -o /dev/null -w "%{http_code}" {API_URL}/api/health` → expect `200`.
   - If health fails, do not consider the deploy complete; fix API/env and redeploy.

## 4. Multi-client (shared backend)

This app is deployed for **separate clients** (e.g. Extreme Dept Kidz, Hunnid Official) from the same codebase. **Right path:**

- **One backend** (this repo’s `inventory-server`) is the canonical API. Deploy it to a single URL (e.g. `inventory-server-iota.vercel.app`). CORS in this repo allows both `warehouse.extremedeptkidz.com` and `warehouse.hunnidofficial.com` by default.
- **Each client** gets its own frontend deployment (its own domain). Set each frontend’s `VITE_API_BASE_URL` at build time to that **same** API URL so both use the same backend.
- **Clones:** If you forked this repo for another client (e.g. Hunnid), do **not** connect the clone’s `inventory-server` to the same Vercel project as this repo. Either (a) point the clone’s frontend at this repo’s deployed API URL and deploy only the frontend from the clone, or (b) deploy the clone’s backend to a **different** Vercel project/URL and add both client origins to CORS there. Only one source should deploy to a given API URL to avoid CORS and code drift.
