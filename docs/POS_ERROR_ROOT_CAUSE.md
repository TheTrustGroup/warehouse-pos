# POS "Something went wrong" — root cause

## Root cause

**In production, the POS error is almost always:**

1. **`VITE_API_BASE_URL` is not set** in the deployment (e.g. Vercel env).
   - When you open the POS route, the app loads `POSPage` → `../lib/api`.
   - `api.ts` runs at **module load time** and throws if `import.meta.env.PROD && !VITE_API_BASE_URL`.
   - The RouteErrorBoundary catches it and shows "Something went wrong in POS" (and the friendly body: "App is misconfigured. Set VITE_API_BASE_URL...").

**Fix:** In your host (e.g. Vercel), set:
- `VITE_API_BASE_URL=""` for same-origin (frontend and API on same domain), or  
- `VITE_API_BASE_URL="https://your-api.vercel.app"` for cross-origin.

Redeploy the frontend after changing env vars (Vite bakes them into the build).

---

## Other possible causes (less common)

- **Rendering before providers:** POS uses `useWarehouse()` and `useInventory()`. If either context were missing, you’d see "useWarehouse must be used within WarehouseProvider" (or the Inventory equivalent). The app tree already wraps POS in both providers, so this only happens if the route tree is changed and POS is rendered outside them.
- **Undefined arrays:** POS defensively uses `safeWarehouses` and `safeInventoryProducts` (arrays) so `.length`/`.map` on undefined no longer crash. If you see a different error in the boundary, check the **raw error** in dev (gray box in RouteErrorBoundary) or in the console.

---

## How to confirm

1. **Dev:** Open POS, trigger the error, and read the **raw error message** in the RouteErrorBoundary gray box or in the browser console (`[RouteErrorBoundary] POS: ...`).
2. **Production:** If the body says "App is misconfigured. Set VITE_API_BASE_URL...", the root cause is the missing env var above.
