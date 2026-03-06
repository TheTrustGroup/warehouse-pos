# Warehouse POS — Inventory & Smart POS

Frontend (Vite + React) and inventory API (Next.js on Vercel) for warehouse inventory and POS. This repo is a **full-stack source**: clone it to spin up duplicate projects (see **docs/CLONE_AND_SETUP.md**).

## Clone and run a duplicate project

See **docs/CLONE_AND_SETUP.md** for: clone → env (frontend + API) → Supabase migrations → run locally → branding → deploy. Quick refs: **docs/ENVIRONMENT.md**, **docs/BRANDING.md**, **docs/ENGINEERING_RULES.md**.

## Run locally

### Frontend (warehouse app + POS)

```bash
# From warehouse-pos root
npm install
npm run dev
```

- App: **http://localhost:5173** (or the port Vite prints).
- Env: copy `.env.example` to `.env` and set `VITE_API_BASE_URL` (e.g. `http://localhost:3001`). Optional: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for product image storage.

### Inventory API (Next.js)

```bash
cd inventory-server
npm install
npm run dev
```

- API: **http://localhost:3001**.
- Env: copy `inventory-server/.env.example` to `.env.local`; set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`).

### Full stack

1. Start **inventory-server** (`cd inventory-server && npm run dev`).
2. Set frontend `.env`: `VITE_API_BASE_URL=http://localhost:3001`.
3. Start frontend: `npm run dev` from `warehouse-pos`.
4. Open **http://localhost:5173**.

## POS and data flow

- **POS route:** `/pos` → `POSPage` → **ProductGrid** (with **POSProductCard** per product). Product search flow can use **ProductSearch** (same data).
- **Data:** Both consume `useInventory().products`, which is **POSProduct**-compatible (see `POSProduct` in `src/components/pos/SizePickerSheet.tsx`). Images come from the list API (`images[]`) or client merge (`productImagesStore`); offline path uses `productsWithLocalImages` so POS still shows images from cache.

## Scripts (frontend)

| Command                  | Description                              |
|--------------------------|------------------------------------------|
| `npm run dev`            | Start Vite dev server                    |
| `npm run build`          | Type-check + production build            |
| `npm run build:server`   | Build inventory-server only              |
| `npm run build:all`      | Build frontend + inventory-server        |
| `npm run test`           | Run Vitest unit tests                    |
| `npm run test:e2e`       | Run Playwright E2E (smoke)               |
| `npm run lint`           | Run ESLint                               |
| `npm run guard:uncommitted` | Exit 1 if uncommitted changes (before leaving) |

## Architecture and roadmap

See **docs/ARCHITECTURE_AND_ROADMAP.md** for system design, API surface, and priorities. **docs/CONNECT.md** is the runbook for connecting to the project. **docs/SUPABASE_VERCEL_SPEED_AND_RELIABILITY.md** is the runbook for keeping the app fast and reliable on Supabase + Vercel. **docs/CURSOR_SUPABASE_VERCEL_MCP.md** documents how Cursor, Supabase, and Vercel are linked via MCP and plugins. **docs/ANALYZE_SUPABASE_AND_VERCEL.md** explains how to analyze both (plugins/MCP + `npm run analyze`). **docs/SHIP_CHECKLIST.md** is the one-page checklist before release or handoff.

## Deploy checklist (inventory-server)

1. **Env:** Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and optional `SESSION_SECRET` / `JWT_SECRET` for auth) in Vercel (or host).
2. **DB:** Run migrations in `inventory-server/supabase/migrations/` so schema matches code (products, sales_orders, user_scopes, etc.). See docs/ARCHITECTURE_AND_ROADMAP.md for base schema notes.
3. **Health:** After deploy, `GET /api/health` should return `200` and `"status":"ok"` (and `"db":"ok"` when Supabase is reachable).
4. **Smoke:** Open frontend → log in → open Inventory or POS → confirm product list loads and at least one card shows an image or placeholder.

## Deploy / 405 fix runbooks

Archived runbooks for CORS and `/api/products` deployment are in **inventory-server/docs/archive/** (e.g. `DEPLOY_AND_VERIFY_405.md`, `DEPLOY_VERIFY_405_FIX.md`).
