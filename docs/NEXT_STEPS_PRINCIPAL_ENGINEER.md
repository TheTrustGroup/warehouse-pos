# Next Steps — Principal Engineer & Data Integrity

**Context:** Phase 3 fixes are deployed (deliveries visibility, vanishing sizes, cost at sale, reports API + UI). This document is the authoritative runbook for what to do next on a production-grade contract.

---

## 1. Immediate (Day 0–1)

### 1.1 Migrations

- Confirm **all four** Phase 3 migrations are applied in order (see `VERIFICATION_CHECKLIST.md`).
- In Supabase Dashboard → SQL Editor, run:
  ```sql
  SELECT * FROM supabase_migrations.schema_migrations
  ORDER BY version;
  ```
  Verify entries for `20260305120000` through `20260305150000` (or your migration runner’s equivalent).

### 1.2 Verification checklist

- Execute every item in **`docs/VERIFICATION_CHECKLIST.md`** (cross-cutting flows + final verification).
- Sign off in writing (ticket, doc, or checklist copy): date, environment, “All items passed” or list exceptions.

### 1.3 Diagnostic queries (data integrity baseline)

- Run the **read-only** diagnostic queries in **`docs/PHASE2_FORENSIC_AUDIT_REPORT.md`** (deliveries counts, products with 0 size records, phantom stock, sales vs sale_lines).
- Record results (counts, any anomalous rows). Fix any drift (e.g. backfill cost_price, reconcile size rows) before declaring “data integrity baseline established.”

### 1.4 Rollback readiness

- **Code:** Previous commit before Phase 3 is known (e.g. `5930ba3`). To roll back app/API only: redeploy that commit; do **not** roll back migrations that have already run (see §2.2).
- **DB:** No automatic rollback of migrations. If a migration must be reverted, do it via a **new** migration that reverses the change (e.g. drop RPC, add back column with backfill), and document in this repo.

---

## 2. First week (operational hardening)

### 2.1 Monitoring and alerts

- **API:** Ensure 4xx/5xx and latency for `/api/sales`, `/api/reports/sales`, `/api/products/*` are visible (e.g. Vercel logs, Sentry, or existing APM). Alert on sustained 5xx or spike in 4xx.
- **DB:** Supabase dashboard (or linked monitoring): watch for failed RPCs (`record_sale`, `update_warehouse_product_atomic`, `get_sales_report`). Alert on repeated failures.
- **Frontend:** If Sentry (or similar) is enabled, confirm errors on Deliveries and Reports pages are reported; no need for new instrumentation unless contract requires it.

### 2.2 Runbook entries

Add to your ops runbook (or create `docs/RUNBOOK.md`):

| Incident | Action |
|----------|--------|
| Deliveries page empty but DB has rows | Check API response shape (array at root vs `data`); check delivery columns and `pending=true` filter in GET `/api/sales`. |
| Sizes vanish after edit | Confirm migration `20260305120000` is applied; confirm updates use RPC/upsert path (no full delete-all of by_size). |
| Reports show wrong revenue/COGS | Confirm `get_sales_report` RPC and GET `/api/reports/sales`; confirm `sale_lines.cost_price` populated (migrations 20260305130000, 20260305140000). |
| Negative stock | CHECK constraints should prevent; if violated, investigate any code or SQL that bypasses `update_warehouse_product_atomic` or direct inserts/updates to inventory tables. |

### 2.3 Backup and restore

- Confirm Supabase (or your Postgres) backups are enabled and retention meets contract requirements.
- Once in a quarter (or per contract): restore to a staging DB from backup and run verification checklist + diagnostic queries to ensure restores are usable.

---

## 3. Ongoing (institutional)

### 3.1 Data integrity

- **Constraints in place:** `quantity >= 0` on inventory tables; RPCs enforce atomic updates. No direct `INSERT`/`UPDATE`/`DELETE` on `warehouse_inventory_by_size` or `warehouse_inventory` from application code except through the RPC or the approved upsert path in `warehouseProducts.ts`.
- **Periodic checks (e.g. weekly or monthly):** Re-run the diagnostic queries from PHASE2. Investigate any new “products with 0 size records” or “phantom stock” rows; fix at source (data fix + code path).

### 3.2 Change control

- **Schema and RPCs:** Any new migration that touches `sales`, `sale_lines`, `warehouse_inventory`, `warehouse_inventory_by_size`, or `warehouse_products` must be reviewed for: (1) no full-table delete of by_size without upsert, (2) no bypass of cost_price at sale for new flows, (3) no relaxation of non-negative quantity.
- **Migrations and code:** Per `ENGINEERING_RULES.md`, migrations and the code that depend on them are committed and pushed together from `warehouse-pos/`.

### 3.3 Sign-off

- **Phase 3 closure:** When immediate steps (§1) and first-week steps (§2) are done and no P0/P1 issues remain, the principal engineer or data integrity owner signs off (e.g. “Phase 3 production verification complete, [date], [name]”). Store in repo (e.g. `docs/SIGNOFF_PHASE3.md`) or in the project’s audit trail.

---

## 4. Summary

| Phase | Owner | Deliverable |
|-------|--------|-------------|
| **Immediate** | Dev/Ops | Migrations applied; verification checklist executed; diagnostics run and baseline recorded; rollback commit identified. |
| **First week** | Ops/Principal | Monitoring and alerts in place; runbook updated; backup/restore confirmed. |
| **Ongoing** | Principal/Data | Periodic diagnostic runs; change control for schema/inventory; Phase 3 sign-off when stable. |

All references (VERIFICATION_CHECKLIST, PHASE2 audit, ENGINEERING_RULES) live under `warehouse-pos/docs/`.
