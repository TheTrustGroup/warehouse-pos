# Main Town shows Main Store data — troubleshooting

If "Main Town" still shows Main Store's stats (e.g. same Total Stock Value / Total Products), follow this in order.

## 1. Verify what the frontend sends

1. Open the app, select **Main Town** in the sidebar.
2. Open DevTools → **Network**.
3. Find the request to your API that loads products (e.g. `.../api/products?warehouse_id=...`).
4. Check the **query parameter** `warehouse_id`:
   - If it is `00000000-0000-0000-0000-000000000001` → the app is still using **Main Store’s id** for "Main Town". Go to step 2.
   - If it is another UUID (e.g. `312ee60a-9bcb-4a5f-b6ae-59393f716867`) → the frontend is correct. The issue is backend or data; go to step 3.

## 2. Fix the warehouse list (so Main Town has its own id)

- **Redeploy** the **inventory-server** (API) so the latest warehouse logic is live: dedupe by name, prefer code `MAINTOWN`, never return "Main Town" with Main Store’s id.
- **Redeploy** the **frontend** so it uses the same dedupe and preference.
- **Clear site data** or hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) so the client doesn’t use an old warehouse list or cached id.
- In Supabase, **run** `inventory-server/supabase/scripts/cleanup_single_main_town.sql` once so the DB has a single Main Town warehouse and merged inventory.

After that, open the app again, select Main Town, and re-check the `warehouse_id` in Network. It should be the Main Town warehouse id, not `00000000-0000-0000-0000-000000000001`.

## 3. If the request already sends Main Town’s id but stats are still Main Store’s

Then the API is returning rows for that id, but those rows are **the same data as Main Store** (duplicated/copied in the DB).

- **Verify:** In the Network tab, check the response header **`X-Warehouse-Id`** (added by the API). It must equal the Main Town uuid you sent. If it matches, the API is querying the right warehouse; the issue is data.
- **Diagnose:** Run **`inventory-server/supabase/scripts/diagnose_warehouse_inventory.sql`** in Supabase. It shows row counts and total quantity per warehouse. If Main Town has the same (or very similar) counts as Main Store, inventory for Main Town was copied from Main Store.
- **Fix (data):** If Main Town should have its own inventory (or start empty), clear its rows so the UI stops showing Main Store’s stats:
  - In the diagnostic script, use the commented `DELETE` statements at the bottom, replace `<MAIN_TOWN_UUID>` with your Main Town warehouse id (e.g. `312ee60a-9bcb-4a5f-b6ae-59393f716867`), and run them once in Supabase.
  - After that, Main Town will show 0 products until you add real Main Town inventory.

## 4. Client guard (already in code)

If the UI selection is "Main Town" but the selected id is Main Store’s (e.g. stale list or cache), the app uses a sentinel warehouse id for the products request so the API returns **no products** and we never show Main Store’s stats under the "Main Town" label. You should then fix the list (step 2) so Main Town gets the correct id.
