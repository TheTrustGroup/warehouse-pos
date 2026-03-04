# Cursor ↔ Supabase ↔ Vercel (MCP & plugins)

**Acknowledged:** This project is developed in **Cursor** with **Supabase** (database + optional storage) and **Vercel** (hosting) linked via **MCP** and **plugins**. The senior engineer and product architect operate with this stack in mind.

---

## How they connect

| Piece | Role | Link to Cursor |
|-------|------|----------------|
| **Cursor** | IDE; agent runs in this workspace | — |
| **Supabase** | Postgres DB + Auth/Storage (optional). API uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Migrations live in `inventory-server/supabase/migrations/`. | **Supabase MCP** (`plugin-supabase-supabase`). Use for project/auth, schema, or DB operations from the agent when needed. May require `mcp_auth` for the server. |
| **Vercel** | Hosts frontend (Vite SPA) and inventory-server (Next.js API). Env and deploy per project. | **Vercel plugin**: `/vercel-deploy` command; **vercel-react-best-practices** skill for React/Next performance. |

- **App flow:** Browser → Vercel (frontend) → `VITE_API_BASE_URL` (Vercel API) → inventory-server → Supabase.
- **Repo:** Single source of truth is `warehouse-pos/` (this repo). Migrations and code that use them are committed together; Supabase project is configured separately (Dashboard or CLI). Vercel projects point at this repo (and optionally at `inventory-server` as root for the API).

---

## What the agent uses

- **Codebase:** All edits and docs are in `warehouse-pos/`. CONNECT, ENGINEERING_RULES, ARCHITECTURE_AND_ROADMAP, and SUPABASE_VERCEL_SPEED_AND_RELIABILITY define runbooks and architecture.
- **Supabase MCP:** When the task needs it (e.g. run or list migrations, inspect schema), the agent can call Supabase MCP tools. Authenticate via `mcp_auth` for server `plugin-supabase-supabase` if required.
- **Vercel:** Deploy via `/vercel-deploy` or `vercel` CLI; env and build settings live in Vercel. The agent does not change Vercel project settings unless asked; it can document required env (see ENV_SETUP, README, SUPABASE_VERCEL_SPEED_AND_RELIABILITY).

---

## How to analyze that everything is good

Use **docs/ANALYZE_SUPABASE_AND_VERCEL.md** and the **`scripts/analyze-supabase-vercel.mjs`** script to verify Supabase and Vercel wiring (health endpoint, env, DB). Supabase MCP can then be used for migrations and schema checks; Vercel Dashboard or CLI for deploy status and env.

## Checklist for a new machine or teammate

1. Open this repo in **Cursor** (workspace = `warehouse-pos` or parent).
2. Enable **Supabase MCP** (and run `mcp_auth` if prompted) so Cursor can talk to your Supabase project when needed.
3. Use **Vercel plugin** for deploys; set `VITE_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc. in Vercel env.
4. Follow **docs/CONNECT.md** to run the app locally and **docs/SUPABASE_VERCEL_SPEED_AND_RELIABILITY.md** for production behavior.
5. Run **`API_BASE_URL=https://your-api.vercel.app node scripts/analyze-supabase-vercel.mjs`** to confirm API + Supabase are reachable.

---

*This doc is the single place that states the Cursor–Supabase–Vercel MCP/plugin link for this project.*
