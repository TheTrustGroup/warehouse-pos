# Post-Deploy Verification Checklist

**After deploying** the Phase 3 fixes (deliveries, vanishing sizes, cost at sale, reports API + UI), run through this list.

---

## Cross-cutting flows (Step 6)

| Check | How to verify |
|-------|----------------|
| **Delivery → inventory** | Create a sale with delivery (pending). Receive stock by editing product quantity. Confirm dashboard and inventory list show updated stock. |
| **Delivery → list** | Mark delivery Dispatched then Delivered via PATCH. Confirm it disappears from pending list and history is visible when not filtering by pending. |
| **Sale → inventory** | Complete a POS sale. Confirm stock decreases in dashboard and product list immediately (or after refresh). |
| **Sale → reports** | Complete a POS sale. Open Reports → Sales; confirm revenue/COGS/profit include the new sale (date range covers today). |
| **Edit product** | Edit a product (name, price, or size quantities). Confirm card updates; confirm no sizes vanish after save. |

---

## Final verification (Step 7)

| Check | Action |
|-------|--------|
| **Deliveries visible** | Open Deliveries page with warehouse selected. If any sales have `delivery_status` pending/dispatched/cancelled, they appear. "No pending deliveries" only when none. |
| **Diagnostic queries** | Run the read-only SQL from `PHASE2_FORENSIC_AUDIT_REPORT.md` (deliveries counts, products with 0 size records, phantom stock). Fix any remaining drift. |
| **Reports numbers** | On Reports → Sales, pick "This Month". Manually sum a few sales from Sales History; confirm Revenue and (if cost_price populated) COGS/Profit match. |
| **Zero states** | Reports show "₵0.00" and "0.0%" where applicable, not blank. |
| **Mobile** | Reports page usable at 375px width (scroll, no horizontal overflow). |

---

## Migrations applied (in order)

1. `20260305120000_upsert_by_size_prevent_vanishing.sql`
2. `20260305130000_sale_lines_cost_price_at_sale.sql`
3. `20260305140000_record_sale_populate_cost_price.sql`
4. `20260305150000_get_sales_report_rpc.sql`

Plus delivery columns: `DELIVERY_MIGRATION.sql`, `ADD_DELIVERY_CANCELLED.sql` (if not already).

**Full next steps (principal engineer / data integrity):** See `docs/NEXT_STEPS_PRINCIPAL_ENGINEER.md`.
