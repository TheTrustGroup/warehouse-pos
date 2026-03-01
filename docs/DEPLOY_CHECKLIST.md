# Deploy checklist (fix 500 / 404 / "Importing a module script failed")

## 1. Frontend (warehouse.extremedeptkidz.com or Vercel)

- **Deploy the full `dist/`** from a single `npm run build`. Do not deploy only `index.html` or only some files; hashed chunk names change every build. If the browser has old HTML pointing to old chunk names, you get **404** for assets and **"Importing a module script failed"**.
- **Cache:** `vercel.json` sets `Cache-Control: no-store` for `/` and `/index.html` so the next request after deploy gets fresh HTML. If you use another host, set the same for the document URL.
- **Service worker:** After deploy, users may need a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or to close and reopen the tab so the new bundle (and new SW if updated) is used.

## 2. Backend API (inventory-server-iota.vercel.app)

- **Env:** Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) in the Vercel project for the API. If either is missing, `/api/size-codes` will throw and return **503** (or 500 on older deploy). The frontend no longer sends `warehouse_id` to size-codes; if you still see requests with `warehouse_id=00000000-0000-0000-0000-000000000000`, that is an **old cached bundle** — deploy the latest frontend and ensure index is not cached.
- **Redeploy** the API after changing env so the new values are in the build.

## 3. Order of operations

1. Build frontend once: `npm run build` in `warehouse-pos`.
2. Deploy **entire** `dist/` (e.g. Vercel frontend project).
3. Deploy API (inventory-server) with correct Supabase env.
4. Hard refresh or new tab when testing so no old HTML/chunks are used.
