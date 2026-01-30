# ✅ READ PATH FIX (STEP 3)

**Rule:** Inventory must never be served from cache. Every load must hit the source of truth.

---

## This app (Vite + React frontend)

- **No Next.js** — so no `force-dynamic` or `revalidate` here.
- **All inventory GETs** in `InventoryContext` use **`cache: 'no-store'`**:
  - `loadProducts()` — initial load and refresh
  - `syncLocalInventoryToApi()` — when fetching current API product IDs
- Effect: browser will not reuse a cached response; each request goes to the server.

---

## If your backend is Next.js App Router

Then the **API route** that serves inventory must be dynamic:

```ts
// e.g. app/api/inventory/route.ts or app/admin/api/products/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
```

And any internal `fetch()` to your DB or upstream should use:

```ts
await fetch(url, { cache: "no-store" });
```

---

## Better option (backend)

Bypass HTTP cache entirely by reading from the DB in the API handler:

```ts
const inventory = await getInventoryFromDB();
return Response.json(inventory);
```

Then the frontend’s `cache: 'no-store'` ensures the browser always requests that endpoint fresh.

---

*Applied in this repo: all inventory GETs in `InventoryContext.tsx` use `cache: 'no-store'`.*
