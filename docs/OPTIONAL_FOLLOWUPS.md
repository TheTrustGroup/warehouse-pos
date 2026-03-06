# Optional follow-ups (post Phase 1 audit)

After the Pentagon audit, P0/P1 fixes, tests, build, and frontend deploy, these steps complete the phase.

---

## 1. Run diagnostics in both Supabase projects

Run the 14 database diagnostic queries in **both** EDK and Hunnid.

| Step | Action |
|------|--------|
| 1 | Open **EDK** Supabase project → **SQL Editor** → New query |
| 2 | Paste/run **`docs/DATABASE_DIAGNOSTIC_QUERIES.sql`** (whole file or block by block) |
| 3 | Note any query where **0 rows** is expected but you get rows (1, 4, 5, 6, 7, 8, 10) |
| 4 | Repeat for **Hunnid** Supabase project |
| 5 | Apply remediation for any non-zero result (see below) |

**Details:** **docs/DATABASE_DIAGNOSTIC_QUERIES_README.md** — checklist, links to SQL Editor, and **remediation table** for each query.

---

## 2. Act on “0 rows = healthy” results

For queries **1, 4, 5, 6, 7, 8, 10**: healthy = 0 rows. If you get rows:

- **docs/DATABASE_DIAGNOSTIC_QUERIES_README.md** → section **Remediation (when 0 rows expected)** has a table with what to do for each query (add PKs, fix orphaned rows, sync stock drift, fix duplicate SKUs, etc.).
- For **Query 2** (FKs without indexes): add the suggested indexes in a migration and apply it to both projects if both use the same schema.

Run the diagnostics again after fixes and confirm 0 rows where expected.

---

## 3. Deploy the backend (inventory-server)

The frontend (warehouse.extremedeptkidz.com) calls the **inventory-server** API. If that API is deployed separately (e.g. its own Vercel project), deploy it so EDK/Hunnid use the latest code.

| Step | Action |
|------|--------|
| Build | From repo root: `cd inventory-server && npm run build` (must succeed) |
| Deploy | Deploy **inventory-server** to your host (e.g. Vercel). Root = `inventory-server` (or monorepo root if using `build:vercel`) |
| Env | Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `UPSTASH_REDIS_*` for dashboard cache |
| App config | Ensure the app’s `VITE_API_BASE_URL` points at this deployment |

**Details:** **docs/DEPLOY_AND_STOCK_VERIFY.md** — full backend deploy and Stock Alerts verification.

---

## Quick checklist

| # | Follow-up | Done |
|---|-----------|------|
| 1 | Run 14 diagnostics in EDK Supabase | ☐ |
| 2 | Run 14 diagnostics in Hunnid Supabase | ☐ |
| 3 | Fix any “0 rows” failures using remediation table | ☐ |
| 4 | Deploy inventory-server (if you use a separate API deploy) | ☐ |
