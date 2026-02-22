# Warehouse Inventory & Smart POS

Warehouse inventory and point-of-sale for **Extreme Dept Kidz**. Dashboard, inventory, orders, POS, sales, and reports in one app.

## Prerequisites

- **Node 20** and npm

## Quick start

### Frontend

```bash
npm install
cp .env.example .env.local
# Set VITE_API_BASE_URL in .env.local to your API URL (e.g. https://your-api.vercel.app)
npm run dev
```

### API (inventory-server)

```bash
cd inventory-server
npm install
cp .env.example .env
# Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET in .env
npm run dev
```

Runs at `http://localhost:3001` by default.

## Environment variables

See **[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)** for all variables (frontend and API). Production must set `VITE_API_BASE_URL` for the frontend; the build fails if it is unset.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm run test` | Run unit tests (Vitest) |
| `npm run lint` | ESLint (max 107 warnings; see [CONTRIBUTING.md](CONTRIBUTING.md)) |
| `npm run test:e2e` | Playwright E2E smoke (requires `PLAYWRIGHT_BASE_URL`) |
| `npm run ci` | Invariants + test + build |

## Layout and design

New or changed pages should follow **[docs/PAGE_LAYOUT.md](docs/PAGE_LAYOUT.md)** (inventory page is the reference).

## Security

- Run `npm audit` in the repo root and in `inventory-server/`. **Critical and high** findings must be resolved or explicitly accepted (e.g. documented in a security note or ADR). Moderate may be accepted for dev-only tooling.
- Current high/moderate findings are in dev/build dependencies (e.g. ESLint, Vite, Next.js); fixing them may require major version upgrades.
- Never commit secrets; use host env (e.g. Vercel, Railway) for production.
