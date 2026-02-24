# Deploy and verify 405 fix — execute in this order

Senior-engineer runbook. Do each step exactly; do not skip.

---

## Step 1 — Commit and push

From the **repository root** (e.g. `World-Class Warehouse Inventory & Smart POS System` or `warehouse-pos`), with all changes staged:

```bash
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System"

# If API lives in warehouse-pos sub-repo:
cd warehouse-pos
git status
git add inventory-server/vercel.json inventory-server/app/api/products/route.ts
git commit -m "fix(api): OPTIONS + CORS for /api/products to fix 405 on cross-origin PUT"
git push origin main
```

If your repo root is different, run the equivalent `git add` / `commit` / `push` so that **inventory-server** (and its `vercel.json` and `app/api/products/route.ts`) is what Vercel builds from.

---

## Step 2 — Confirm deployment

1. Open **Vercel** → project **warehouse-pos-api-v2**.
2. **Deployments** → wait for the new deployment (from the push in Step 1) to finish. Status must be **Ready** (green).
3. Open that deployment → **Build** log.
4. Confirm:
   - Build completed without error.
   - **Route (app)** list includes **`ƒ /api/products`** and **`ƒ /api/products/[...id]`**.
5. If **Root Directory** is set, it must be **`inventory-server`** (no leading slash).  
   **Settings** → **General** → **Root Directory** = `inventory-server`. Save and redeploy if you changed it.

---

## Step 3 — Retest in the app (Save changes)

1. Open the warehouse app in the browser: **https://warehouse.extremedeptkidz.com** (or your frontend URL).
2. Log in if required (e.g. cashier or admin).
3. Go to the **Inventory / Warehouse** view and open the product list.
4. Open a product in the edit modal (e.g. **Air force 1 (White)**).
5. Change one value (e.g. a size quantity or name).
6. Click **Save changes**.
7. **Expected:** No red **HTTP 405** banner; a success toast or the modal closes and the list reflects the change.
8. **If 405 still appears:** go to Step 5.

---

## Step 4 — Verify in Network tab

1. Open **Developer Tools** → **Network**.
2. Leave the tab open and repeat: open a product → edit → **Save changes**.
3. In the list of requests, find the **preflight** and the **update** request:
   - **OPTIONS**  
     - **Request URL:** `https://warehouse-pos-api-v2.vercel.app/api/products` (no query or path suffix).  
     - **Status:** **204** (or 200).  
     - **Response headers** should include `Access-Control-Allow-Methods` with `PUT`, `PATCH`.
   - **PUT**  
     - **Request URL:** `https://warehouse-pos-api-v2.vercel.app/api/products` (same, no id in path).  
     - **Status:** **200** (or 201).  
     - **Initiator:** e.g. `InventoryPage-….js`.
4. If both OPTIONS → 204 and PUT → 200, the fix is verified.

---

## Step 5 — If 405 still occurs

1. In **Network**, click the request that shows **405** (the red one).
2. Note exactly:
   - **Request URL** (full).
   - **Request method** (PUT or PATCH).
   - **Response** body (e.g. JSON error message).
3. In **Vercel** → **Logs** for the same deployment, set time range to the last 5–10 minutes, and search for the request path (e.g. `/api/products` or the product id). Check which route appears and any error line.
4. **If the failing request is PUT to `/api/products` (no id in path):**  
   The base route should handle it. Confirm the deployment includes the latest `app/api/products/route.ts` (OPTIONS export and CORS). Redeploy with **Clear build cache and redeploy** if unsure.
5. **If the failing request is PUT to `/api/products/<uuid>`:**  
   The catch-all `app/api/products/[...id]/route.ts` should handle it. Confirm the build output shows **`ƒ /api/products/[...id]`** and that Root Directory is correct. Check Logs for that path and any 405 or method-not-allowed message.

---

## Checklist (quick reference)

- [ ] Step 1: Changes committed and pushed; deployment triggered.
- [ ] Step 2: New deployment Ready; build log shows `ƒ /api/products` and `ƒ /api/products/[...id]`; Root Directory = `inventory-server` if used.
- [ ] Step 3: Edit product → Save changes → no HTTP 405 in UI.
- [ ] Step 4: Network shows OPTIONS → 204 and PUT → 200 for `/api/products`.
- [ ] Step 5: If 405 persists, URL/method/response and Vercel Logs captured for debugging.
