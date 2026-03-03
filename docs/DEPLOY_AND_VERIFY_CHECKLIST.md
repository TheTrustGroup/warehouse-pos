# Deploy and verify checklist (sensible approach)

## Step 1 — Pre-deploy (done)

- [x] `npm run build` — passed
- [x] `npm run test` — 113 tests passed

## Step 2 — Deploy to production

From **`warehouse-pos/`** (the app repo):

1. **Commit and push** (if not already):
   ```bash
   git status
   git add -A
   git commit -m "fix: 401 cross-origin auth, e.trans guard, cache-first inventory"
   git push origin main
   ```

2. **Trigger deployment**  
   Use your normal process (e.g. Vercel auto-deploy on push, or manually trigger the frontend project).  
   Ensure the project that serves the **inventory frontend** is the one that builds from `warehouse-pos/` (or your configured root).

3. **Wait for the deployment** to finish and the production URL to be updated.

## Step 3 — Check in production

On the **live** app URL (production):

1. **Login**  
   Sign in with a user that has access to Inventory (e.g. admin or warehouse).

2. **Open Inventory**  
   Go to the Inventory page (Main Store or your warehouse).

3. **Verify:**
   - [ ] Products load (no empty list unless the warehouse truly has none).
   - [ ] No **401** in Network: open DevTools → Network, filter by "products" or "Fetch/XHR"; the request to `/api/products` should be **200** (not 401).
   - [ ] No **console errors**: DevTools → Console; there should be no `e.trans` or "null is not an object (evaluating 'e.trans')".
   - [ ] **Cache behavior (optional):** Refresh the page or go away and back to Inventory; the list should appear quickly (from cache), then stay correct after the background refresh.

4. **If anything fails:**  
   - Note the exact error (status code, console message, Network response body).  
   - Roll back the deployment if needed, or fix and redeploy.  
   - For 401: confirm the auth backend returns a token in the login (and optionally /me) response; see `AUTH_401_CROSS_ORIGIN.md`.

## Step 4 — If something is wrong

- **401 still:** Backend must return `token` or `access_token` in login (and optionally /me) response; client stores it and sends `Authorization: Bearer`. See `docs/AUTH_401_CROSS_ORIGIN.md`.
- **e.trans or IDB errors:** Report the exact stack trace; logger and DebugPanel are guarded but other IDB paths may need the same.
- **Build/test failed before deploy:** Fix the reported errors, run `npm run build` and `npm run test` again, then repeat from Step 2.
