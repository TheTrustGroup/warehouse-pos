# Data integrity — production standards

This document defines how we protect and audit critical data (sales, inventory, voids, and destructive admin actions) so the system is safe for production and audit-ready.

---

## Principles

1. **No silent data loss** — Destructive operations (truncate, bulk delete) are explicit, confirmed, and audited. Migrations never run DELETE/TRUNCATE that wipes tables when applied; one-off clears use an RPC + API with confirmation.
2. **Authority and scope** — Every mutation is gated by auth (admin, POS role, warehouse scope). Void and clear are restricted; sales are scoped to the caller’s warehouse(s).
3. **Idempotency where possible** — Void is idempotent (already voided → no-op). Record-sale and clear are single-shot but guarded (clear requires confirmation body).
4. **Audit trail** — Admin clear is logged (who, when) in application logs. Void and record-sale are reflected in DB state (status, timestamps, stock_restored_at).

---

## Critical flows

| Flow | Auth | Safeguard | Audit |
|------|------|------------|--------|
| Record sale | POS role, warehouse scope | Idempotency key for POST; stock decrement in DB | sales + sale_lines rows |
| Void sale | POS role, warehouse scope for that sale | Idempotent if already voided; stock restored in RPC | status = voided, stock_restored_at |
| Clear sales history | Admin only | Body `{ "confirm": "CLEAR_ALL_SALES" }` required | Log: admin email + ISO timestamp |

---

## Migrations and scripts

- **Migrations** (`inventory-server/supabase/migrations/`) must not contain one-off DELETEs/TRUNCATEs that run automatically and wipe data. Use placeholder migrations (comments only) and perform clears via RPC/API or documented manual procedure.
- **Manual clear** — If the admin API is unavailable, use the steps in `inventory-server/supabase/scripts/clear_sales_manual.sql`. Prefer the API so the action is logged.
- **RPCs** — `void_sale(uuid)` and `clear_sales_history()` are SECURITY DEFINER, `search_path = public`, and granted only to `service_role`. The API enforces admin/POS and scope.

---

## Checklist before release

- [ ] All destructive API routes require explicit confirmation or role and are logged where appropriate.
- [ ] No migration file runs TRUNCATE/DELETE on business data as part of normal migration apply.
- [ ] Void and record-sale paths use single RPCs or transactions so stock and sales stay consistent.
- [ ] Clear-sales-history is called with `{ "confirm": "CLEAR_ALL_SALES" }` from the client and is admin-only.

See also: `docs/ENGINEERING_RULES.md`, `docs/SERVER_STABILITY_AND_AVAILABILITY.md`, and `inventory-server/supabase/scripts/clear_sales_manual.sql`.
