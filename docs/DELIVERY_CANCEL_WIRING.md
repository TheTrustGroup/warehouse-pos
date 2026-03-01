# Delivery cancel — wiring and semantics

## Is everything wired?

Yes. End-to-end flow:

| Layer | What happens |
|-------|----------------|
| **DB** | `ADD_DELIVERY_CANCELLED.sql` allows `delivery_status IN (..., 'cancelled')`. Run this migration in Supabase; without it, PATCH with `cancelled` will fail on the constraint. |
| **API PATCH /api/sales** | Accepts `deliveryStatus: 'cancelled'`. Updates only `sales.delivery_status`; does **not** set `delivered_at`/`delivered_by`. No sale or stock changes. |
| **API GET /api/sales?pending=true** | Returns rows where `delivery_status IN ('pending', 'dispatched', 'cancelled')`, so the Deliveries page can show and filter cancelled. |
| **DeliveriesPage** | "Cancel delivery" button → `confirm()` → `updateStatus(id, 'cancelled')` → PATCH with `{ saleId, deliveryStatus: 'cancelled', warehouseId }`. Optimistic UI update; Cancelled filter pill and badge. |
| **SalesHistoryPage** | Shows a "Cancelled" badge when `deliveryStatus === 'cancelled'`. |

So when you click **Cancel delivery**, the backend **does** persist `delivery_status = 'cancelled'` for that sale. The wiring is correct.

---

## Do orders truly cancel when you cancel?

**No.** Only the **delivery** is cancelled, not the order/sale.

- **What is cancelled:** The scheduled delivery. The sale row stays; `sale_lines` stay; **stock remains deducted**; payment is still recorded.
- **What is not done:** No refund, no restoring stock, no deleting or voiding the sale.

So in plain terms:

- **"Cancel delivery"** = “We are not delivering this.” The **order/sale is still valid** (customer paid, stock was taken). Refunds or returns are a separate process if you add them later.
- **"Cancel order"** (full reversal: void sale + restore stock ± refund) is **not** implemented. That would be a separate feature (e.g. “Void sale” or “Cancel order” with stock restoration and optional refund flow).

If you want full order cancellation (void sale + restore stock), that can be added as a separate action and API (e.g. POST /api/sales/:id/void or similar) with explicit business rules (who can void, time limits, etc.).
