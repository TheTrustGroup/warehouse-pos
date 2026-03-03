# Deploy clean build, then verify

## Pre-deploy (done)

- [x] `npm run build` — passed
- [x] `npm run test` — 113 tests passed

---

## Step 1 — Deploy

From **`warehouse-pos/`**:

1. **Commit and push**
   ```bash
   git status
   git add -A
   git commit -m "fix: 401 cross-origin auth, e.trans guard, cache-first inventory, Dexie catch"
   git push origin main
   ```

2. **Trigger deployment**
   - Vercel will deploy the **warehouse-pos** (frontend) project if it’s connected to this repo.
   - Wait until the latest deployment shows **Ready** in the Vercel dashboard.

3. **Confirm API URL**
   - In Vercel → **warehouse-pos** → **Settings** → **Environment Variables**
   - Ensure **VITE_API_BASE_URL** = `https://warehouse-pos-api-v2.vercel.app` (Production).
   - If you changed it, **redeploy** the frontend so the new value is baked in.

---

## Step 2 — Verify after deploy

On the **live** frontend URL (e.g. https://warehouse.extremedeptkidz.com):

1. **Login** with a user that has access to Inventory.

2. **Open Inventory** (Main Store or your warehouse).

3. **Network**
   - DevTools → **Network** → filter by "products" or "Fetch/XHR".
   - Find the request to `warehouse-pos-api-v2.vercel.app/api/products`.
   - Confirm **Status: 200** (not 401).
   - Confirm **Request Headers** include `Authorization: Bearer ...`.

4. **Console**
   - DevTools → **Console**.
   - Confirm no **e.trans** or "null is not an object (evaluating 'e.trans')".
   - Occasional "The network connection was lost" is acceptable; the app should recover on refresh.

5. **UI**
   - Products list loads (or shows empty only if the warehouse has none).
   - Optional: refresh the page and confirm the list appears quickly (cache), then stays correct.

---

## If something fails

- **401:** Backend must return a token in login (and optionally /me). See `AUTH_401_CROSS_ORIGIN.md`.
- **e.trans:** Note the full stack trace and which page/action; we can add another guard.
- **Connection lost often:** Consider reducing duplicate product requests or increasing timeout; see `DEPLOY_AND_VERIFY_CHECKLIST.md`.
