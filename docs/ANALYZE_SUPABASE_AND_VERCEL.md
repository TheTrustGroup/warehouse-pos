# How to analyze Supabase and Vercel (plugins + scripts)

Ways to verify that Supabase and Vercel are wired correctly and healthy.

---

## 1. Using plugins / MCP in Cursor

### Supabase (MCP)

- **Plugin:** Supabase MCP (`plugin-supabase-supabase`). If it asks for auth, run **`mcp_auth`** for that server (e.g. from Cursor’s MCP tool panel or command).
- **What you can do:** Once connected, the Supabase MCP can expose project/config, tables, migrations, and sometimes run SQL. Use it to:
  - Confirm the project linked to this repo.
  - Check that migrations in `inventory-server/supabase/migrations/` are applied (or compare with what’s in the project).
  - Inspect tables (e.g. `warehouse_products`, `user_scopes`, `sales`) and indexes.
- **Skill:** The **Supabase Postgres best practices** skill (from the Supabase plugin) helps with query design, indexes, and RLS—useful when reviewing migrations or slow queries.

### Vercel (plugin)

- **Plugin:** Vercel plugin (deploy + React/Next best practices). It does **not** expose a dedicated “analyze Vercel” or “health” MCP tool.
- **What you can do:**
  - **Deploy:** Use **`/vercel-deploy`** to deploy; that confirms the project builds and deploys.
  - **Status:** Use the **Vercel Dashboard** (vercel.com) or **Vercel CLI** (`vercel inspect`, `vercel logs`, `vercel env ls`) to check deployments, env vars, and logs.
  - **Best practices:** The **vercel-react-best-practices** skill is used automatically when working on React/Next code; no separate “analyze” step.

---

## 2. Script-based check (API health = Supabase + Vercel)

Your **inventory-server** on Vercel exposes a health endpoint that effectively checks both:

- **Vercel:** If the request reaches the server and returns JSON, the function is running.
- **Supabase:** Use `?db=1` to probe the database; if `db.ok === true`, the API can reach Supabase.

Run the built-in health script against your **deployed** API:

```bash
# From warehouse-pos/ (or set BASE_URL to your deployed API)
BASE_URL=https://your-api.vercel.app node inventory-server/scripts/health-check.mjs
# Exit 0 = OK, exit 1 = fail
```

Or run from repo root: **`npm run analyze`** (or `API_BASE_URL=https://your-api.vercel.app npm run analyze`) for a printed report.

---

## 3. Full analysis script (one command)

A script that hits `/api/health`, `/api/health?env=1`, and `/api/health?db=1` and prints a short report. Run from the repo root:

```bash
# Local API
node scripts/analyze-supabase-vercel.mjs

# Deployed API
API_BASE_URL=https://your-api.vercel.app node scripts/analyze-supabase-vercel.mjs
```

Interpretation:

- **status ok** → Vercel is serving the API.
- **env.supabaseUrl / env.serviceRoleKey** → Env vars are set in Vercel (no secrets printed).
- **db.ok** → Supabase is reachable from the API; migrations and schema can be checked next (e.g. via Supabase MCP or Dashboard).

---

## 4. Checklist: “everything is good”

| Check | How |
|-------|-----|
| API is up | `GET /api/health` → `{"status":"ok"}`. Use script above or curl. |
| Env set in Vercel | `GET /api/health?env=1` → `env.supabaseUrl`, `env.serviceRoleKey` true. Or Vercel Dashboard → Project → Settings → Environment Variables. |
| DB reachable | `GET /api/health?db=1` → `db.ok === true`. |
| Migrations applied | Supabase Dashboard → SQL Editor, or Supabase MCP (list/run migrations). Compare with `inventory-server/supabase/migrations/`. |
| Frontend talks to API | In browser: login → Inventory or POS → products load. `VITE_API_BASE_URL` must point at the same API you checked above. |
| CORS | If requests from the frontend fail with CORS, set `CORS_ORIGINS` or `FRONTEND_ORIGIN` in Vercel env for the API project. |

---

## 5. Where things live

| Goal | Where |
|------|--------|
| This runbook | `docs/ANALYZE_SUPABASE_AND_VERCEL.md` |
| Health endpoint | `inventory-server/app/api/health/route.ts` |
| Simple health script | `inventory-server/scripts/health-check.mjs` |
| Full analysis script | `npm run analyze` (runs `scripts/analyze-supabase-vercel.mjs`) |
| Speed/reliability | `docs/SUPABASE_VERCEL_SPEED_AND_RELIABILITY.md` |
| Cursor + Supabase + Vercel link | `docs/CURSOR_SUPABASE_VERCEL_MCP.md` |

---

*Use the plugins/MCP for deeper Supabase and Vercel workflow; use the scripts and health endpoint for a quick “is everything good?” check.*
