# Inventory lifecycle and authoritative data store (P0 reliability)

## Full inventory lifecycle flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. UI (Inventory.tsx)                                                                   │
│    ProductFormModal → form state (local React state)                                     │
│    handleSubmitProduct() → addProduct(data) or updateProduct(id, data)                   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. Submit handler (InventoryContext)                                                     │
│    addProduct() / updateProduct()                                                        │
│    productToPayload() → serialize dates, include version                                 │
│    apiPost(API_BASE_URL, '/admin/api/products', payload) or fallback '/api/products'     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. API client (apiClient.ts)                                                             │
│    apiRequest() → fetch with retries, circuit breaker, credentials: 'include'            │
│    GET/POST/PUT/DELETE to API_BASE_URL (external backend, not in this repo)               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. Backend (extremedeptkidz.com – EXTERNAL)                                              │
│    Validation → database write (authoritative store).                                    │
│    This repo does NOT contain the backend that serves /admin/api/products.               │
│    warehouse.extremedeptkidz.com and extremedeptkidz.com must use SAME backend + DB.    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 5. Database (authoritative)                                                               │
│    Owned by backend at API_BASE_URL. Single source of truth for inventory.               │
│    Client never writes directly to DB; all writes go via API.                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 6. Read path                                                                             │
│    loadProducts() → apiGet(API_BASE_URL, '/admin/api/products') or '/api/products'       │
│    Response normalized → setProducts(). Optional: merge "localOnly" from localStorage    │
│    (localOnly = items that exist only in this browser when API had failed on add).        │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 7. Cache layer (client-side only – NOT source of truth)                                  │
│    localStorage key: warehouse_products (fallback when API fails; for offline UX)        │
│    IndexedDB: products store (same; cache + offline)                                     │
│    Both are best-effort. Cross-device consistency requires server persistence only.      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 8. UI hydration                                                                          │
│    products from InventoryContext (useState) → ProductTableView / ProductGridView        │
│    React state is derived from: API response + optional localOnly merge.                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Authoritative data store (explicit answers in code)

- **What database is used?**  
  The database is owned by the backend at `API_BASE_URL` (extremedeptkidz.com). This frontend does not connect to any database. The inventory-server in this repo uses Supabase (Product, ProductVariant tables) but that is a different app and schema; the warehouse UI does NOT use inventory-server for /api/products.

- **Is it the same in all environments?**  
  Only if `VITE_API_BASE_URL` is set consistently. Build fails in production if it is missing (no default), so all production builds must point to the same backend.

- **Is warehouse using a different DB than storefront?**  
  Warehouse (warehouse.extremedeptkidz.com) and storefront (extremedeptkidz.com) both call the same `API_BASE_URL`. If that URL points to one backend, they share one DB. If warehouse were to use a different API_BASE_URL (e.g. warehouse API), they would be different — we fail the build if API base is unset to avoid accidental default.

- **Are credentials/env vars identical?**  
  Frontend only has `VITE_API_BASE_URL`. Auth is via cookies or Bearer in headers (getAuthToken()). Backend credentials are on the server; env vars must be identical per environment (e.g. same DB URL for the app that serves both domains).

- **Inventory table/collection differs by env?**  
  Not controlled by this repo. Backend must expose the same inventory table to both warehouse and storefront. If the backend uses different tables per domain, that would cause “data vanishes on other device” — backend must be single source of truth and same for all clients.
