# How the Database Communicates With the Project

## Overview

The **frontend never talks to the database**. Only the **backend (inventory-server)** connects to the database. The browser talks to the API; the API talks to Supabase.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (warehouse.extremedeptkidz.com)                                 │
│  - React app (Vite)                                                      │
│  - No DB connection, no SUPABASE_URL or keys                            │
│  - Uses: VITE_API_BASE_URL (e.g. https://extremedeptkidz.com)            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    │  HTTPS (fetch)
                                    │  Authorization: Bearer <token>
                                    │  Cookies (optional)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  API / Backend (extremedeptkidz.com or your inventory-server deploy)    │
│  - Next.js API routes: /api/*, /admin/api/*                              │
│  - Auth: session cookie + Bearer token (no DB for auth; in-memory env)  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    │  Supabase client (server-side only)
                                    │  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Database (Supabase / PostgreSQL)                                       │
│  - Tables: warehouse_products, warehouse_inventory, stores,             │
│    warehouses, user_scopes, sync_rejections, transactions, etc.        │
│  - RPCs: create_warehouse_product_atomic, update_warehouse_product_      │
│    atomic, process_sale_deductions, process_return_stock, process_sale   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Frontend (no database)

- **Location:** `warehouse-pos/src/` (React + Vite).
- **Config:** `VITE_API_BASE_URL` in `.env` or Vercel — points to the API origin (e.g. `https://extremedeptkidz.com` or your inventory-server URL).
- **Behavior:** All data goes through `fetch()` to that base URL (e.g. `GET /api/products`, `POST /admin/api/login`). No database URL or keys; no direct DB connection.

---

## 2. Backend (inventory-server) → database

- **Location:** `warehouse-pos/inventory-server/`.
- **Database:** **Supabase** (PostgreSQL). Connection is via **Supabase JS client** with the **service role** key (server-side only).
- **Env (required for DB):**
  - `SUPABASE_URL` — Supabase project URL (e.g. `https://xxxx.supabase.co`).
  - `SUPABASE_SERVICE_ROLE_KEY` — Service role secret (bypasses Row Level Security; never expose to the frontend).
- **Where it’s used:** Under `inventory-server/lib/data/`:
  - **warehouseProducts.ts** — `warehouse_products`, quantities from `warehouse_inventory` / by-size tables; RPCs for atomic create/update.
  - **warehouseInventory.ts** — quantity upserts and RPCs `process_sale_deductions`, `process_return_stock`.
  - **warehouseInventoryBySize.ts** — size-based inventory.
  - **stores.ts**, **warehouses.ts** — stores and warehouses tables.
  - **userScopes.ts** — `user_scopes` (POS/store/warehouse assignment).
  - **transactions.ts** — transactions and `process_sale` RPC.
  - **syncRejections.ts**, **stockMovements.ts**, **sizeCodes.ts**, **inventory.ts** (Product/Variant/Category), etc.
- **Flow:** API route (e.g. `app/api/products/route.ts`) calls a data-layer function (e.g. `getWarehouseProducts()`); that function calls `getSupabase()` and then `supabase.from('table')` or `supabase.rpc('name', {...})`.

---

## 3. Auth (no DB)

- Login and session are **not** stored in Supabase in this repo.
- Auth uses **signed cookies** and **Bearer token** (see `inventory-server/lib/auth/session.ts`). Role comes from **email** and env (`ALLOWED_ADMIN_EMAILS`, etc.). User/scopes for POS **are** in Supabase (`user_scopes`); session itself is cookie + token.

---

## 4. Important points

| Question | Answer |
|----------|--------|
| Who connects to the DB? | Only **inventory-server** (backend). Frontend never does. |
| How does the frontend get data? | By calling **API_BASE_URL** (e.g. `/api/products`, `/api/auth/user`). |
| What if I use a different API (e.g. extremedeptkidz.com)? | Then that server’s own DB (and env) are used. Frontend still only talks to that API. |
| Where are SUPABASE_* set? | In **inventory-server** env (e.g. `.env.local`, Vercel env for the API project). Not in the frontend. |
| Same DB for warehouse and storefront? | Only if both use the **same API** (same `API_BASE_URL`). That API then uses one Supabase project. |

So: **database communication is “API (inventory-server) ↔ Supabase”; the project (browser) only talks to the API.**
