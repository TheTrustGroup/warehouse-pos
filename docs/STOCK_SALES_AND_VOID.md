# Stock: direct sales, scheduled delivery, and void

## Summary

- **Direct sales** (no delivery): stock is **deducted** when the sale is completed (`record_sale` with no `deliverySchedule`).
- **Scheduled delivery sales**: stock is **reserved** when the sale is completed; it is **deducted** only when the delivery is marked **delivered** (PATCH `deliveryStatus: 'delivered'` → `complete_delivery` RPC). If the delivery is **cancelled**, reservations are released (no deduction).
- **Void sale**: stock is returned to inventory — either by **releasing reservations** (if the sale was a delivery that was never marked delivered) or by **restoring deducted quantities** (if the sale was direct or the delivery was already completed).

## Flows

| Event | Direct sale | Delivery sale (pending/dispatched) | Delivery sale (delivered) |
|-------|-------------|-------------------------------------|----------------------------|
| **Record sale** | Deduct stock | Reserve stock only | N/A |
| **Mark delivered** | N/A | Deduct reserved stock, clear reservations | N/A |
| **Cancel delivery** | N/A | Release reservations | Not allowed |
| **Void sale** | Restore stock | Release reservations | Restore stock |

## API and DB

- **POST /api/sales** — Body may include `deliverySchedule`. If present, `record_sale` reserves stock and sets `delivery_status = 'pending'`; if absent, it deducts immediately.
- **PATCH /api/sales** — Body: `{ saleId, deliveryStatus: 'dispatched' | 'delivered' | 'cancelled', warehouseId }`. `delivered` → `complete_delivery(sale_id)` (deduct + clear reservations). `cancelled` → `release_delivery_reservations(sale_id)`. `dispatched` → update `delivery_status` only.
- **POST /api/sales/void** — Calls `void_sale(sale_id)`: if the sale has reservations, deletes them and sets `status = 'voided'`; otherwise restores stock from `sale_lines` and sets `status = 'voided'`, `stock_restored_at = now()`.

## Migrations

- `20260306000000_sales_delivery_reserve_and_deduct.sql`: adds `delivery_schedule`, `delivery_status`, `delivered_at` on `sales`; table `sale_reservations`; `record_sale` 11-param (with `p_delivery_schedule`); `complete_delivery`, `release_delivery_reservations`; updated `void_sale`.
