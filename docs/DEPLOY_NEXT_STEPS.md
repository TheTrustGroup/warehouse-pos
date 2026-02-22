# Next steps after seed: deploy → test → commit

Run in this order.

---

## 1. Deploy

- **Frontend:** Deploy the app (e.g. Vercel). Ensure `VITE_API_BASE_URL` points to your API URL.
- **API:** Deploy the inventory-server (e.g. Vercel, Railway). Set env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and any allowed origins.
- **Supabase:** You already ran `phase3_stores_and_user_scopes_schema.sql` and `seed_stores_warehouses.sql`; no extra deploy step for DB.

---

## 2. Test

- **Local (already run):** `npm run lint`, `npm run test`, `npm run build` in repo root; `npm run build` in `inventory-server`. All passed.
- **After deploy:** In the live app, log in → open the **Warehouse** dropdown in the sidebar → confirm **Main Store** and **Main Town** appear → switch and confirm Dashboard “Inventory stats for: …” and Inventory list update.
- **Optional:** If you set `PLAYWRIGHT_BASE_URL`, push and let CI run the E2E job.

---

## 3. Commit

Stage and commit the changes (see commit message below). Then push to trigger CI.
