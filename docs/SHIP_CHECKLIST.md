# Ship checklist (senior-engineer)

One-page list before release or handoff. Use with CONNECT, ENGINEERING_RULES, and ANALYZE_SUPABASE_AND_VERCEL.

---

## Before you ship (or hand off)

| Step | Command / action |
|------|-------------------|
| **1. CI green** | Push to `main`; confirm GitHub Actions pass (lint, test, frontend build, backend build). |
| **2. No uncommitted work** | From `warehouse-pos/`: `git status -sb` then `npm run guard:uncommitted` (optional). Commit and push any changes. |
| **3. Migrations** | All new `.sql` in `inventory-server/supabase/migrations/` (or `supabase/migrations/`) committed with the code that uses them. |
| **4. Env (Vercel API)** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, POS/auth vars set in the Vercel project for inventory-server. |
| **5. Env (Vercel frontend)** | `VITE_API_BASE_URL` points at the deployed API URL (no trailing slash). |
| **6. Verify live** | `API_BASE_URL=https://your-api.vercel.app npm run analyze` → all ✓. Then open app → login → Inventory or POS → products load. |
| **7. CORS** | If frontend and API are on different origins, set `CORS_ORIGINS` or `FRONTEND_ORIGIN` in the API project env. |

---

## Before you leave (end of day)

- From `warehouse-pos/`: `git status -sb` → commit and push. Optionally `npm run guard:uncommitted`.
- See **docs/ENGINEERING_RULES.md** §3.

---

## Quick links

| Need | Doc |
|------|-----|
| Run locally | `docs/CONNECT.md` |
| Commit / migrations | `docs/ENGINEERING_RULES.md` |
| Architecture + roadmap | `docs/ARCHITECTURE_AND_ROADMAP.md` |
| Speed + reliability | `docs/SUPABASE_VERCEL_SPEED_AND_RELIABILITY.md` |
| Analyze Supabase + Vercel | `docs/ANALYZE_SUPABASE_AND_VERCEL.md`, `npm run analyze` |
| Cursor + MCP | `docs/CURSOR_SUPABASE_VERCEL_MCP.md` |
