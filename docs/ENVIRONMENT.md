# Environment variables

Set these in your host (e.g. Vercel, Railway) or in `.env.local` for local runs. Never commit real secrets.

## Frontend (Vite)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | **Yes** (production) | Backend API base URL, no trailing slash. Production build fails if unset. |
| `VITE_HEALTH_URL` | No | URL for health pings (observability). |
| `VITE_SENTRY_DSN` | No | Sentry DSN for error reporting (wire in main.tsx when consent exists). |

**Example (production):** Set `VITE_API_BASE_URL` to your deployed API (e.g. `https://warehouse-pos-api-v2.vercel.app`).

**Local:** Copy repo root `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to your local or staging API.

## API / inventory-server (Node)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL (Settings → API). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Service role key (server-only; never expose to client). |
| `SESSION_SECRET` | **Yes** (production) | Session signing secret, min 16 chars. |
| `BASE_URL` | No | Base URL of this API (health checks). Default: `http://localhost:3001`. |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins. Defaults in lib/cors.ts if unset. |
| `ALLOWED_ORIGIN_SUFFIXES` | No | Comma-separated hostname suffixes (e.g. `.vercel.app`). Request origin is allowed if its hostname ends with one. Defaults include `.vercel.app`, `.extremedeptkidz.com` so health and API work from Vercel frontends. |

**Local:** Copy `inventory-server/.env.example` to `inventory-server/.env` or `.env.local` and set the required values.

## Inventory (frontend)

- **Warehouse scope:** Dashboard, Inventory, and POS use the warehouse selected in the sidebar (single source of truth in `WarehouseContext`). All product and sales requests include `warehouse_id`.
- **API:** Products and size-codes are loaded from `VITE_API_BASE_URL` (e.g. `GET /api/products?warehouse_id=...`, `GET /api/size-codes?warehouse_id=...`). Product create/update/delete use the same base URL; delete is `DELETE /api/products/:id` with body `{ warehouseId }`.
