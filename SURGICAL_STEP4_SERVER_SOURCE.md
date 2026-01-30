# STEP 4 — REMOVE CLIENT-SIDE INVENTORY FETCHING (REFINE)

**Goal:** Server is the single source of truth. No client merge, SWR, React Query, or refetch logic.

---

## ❌ Removed (in this repo)

- **Client-side merge** — No more merging API response with localStorage or “prefer local when API has 0”. When the API succeeds, we use **only** the API response.
- **preferLocalNumber / localOnly** — No client override of server data. Server says X → UI shows X.
- **SWR / React Query** — Not used; no client refetch/cache layer added.
- **Refetch logic** — One load on mount + explicit `refreshProducts()` only (e.g. after add or “Sync to server”). No automatic refetch timers or cache invalidation.

---

## ✅ Target: Server Component → DB

**Ideal (Next.js / server-rendered):**

```
InventoryPage (Server)
  ↓
getInventory()
  ↓
Supabase
```

- No client-side inventory fetch. The page is a Server Component that calls `getInventory()` (e.g. Supabase query) and passes data as props.

---

## This app (Vite + React SPA)

- **No Server Components** — So we cannot literally “remove all client-side inventory fetching” without SSR.
- **Backend must implement:** When the API receives `GET /admin/api/products` or `GET /api/products`, it must be implemented as:
  - **getInventory() → Supabase** (server-side only).
  - No caching of the inventory response (or explicit revalidate).
- **Frontend:** One minimal fetch on app mount that calls that API. No merge, no override. On success → `setProducts(apiResponse)`. On failure (offline) → fallback to localStorage only for resilience.

So the “replace with” is:

- **Server (your API):** `GET /api/products` = `getInventory()` → Supabase → return JSON.
- **Client (this repo):** Single `loadProducts()` that fetches that URL with `cache: 'no-store'` and sets state to the response. No client-side inventory “fetching logic” beyond that.

---

## Summary

| Layer        | Responsibility                                      |
|-------------|------------------------------------------------------|
| **Backend** | getInventory() → Supabase. Single source of truth.   |
| **Frontend**| One fetch to API on load; use response as-is.       |

*Applied in this repo: `loadProducts()` uses API response only (no merge). Offline fallback to localStorage remains for resilience only.*
