# Deliveries model

**Deliveries** in this app are **sales** that have delivery-related fields. There is no separate `deliveries` table.

- **Source:** `sales` table with columns such as `delivery_status`, `delivery_address`, `recipient_name`, `expected_date`, `delivered_at`, etc.
- **API:** The Deliveries page uses **GET /api/sales?warehouse_id=…&pending=true** and filters by `delivery_status` (e.g. `pending`, `dispatched`, `delivered`, `cancelled`). Updating delivery status uses **PATCH /api/sales** with `deliveryStatus` and `saleId`.
- **Optional later:** If the delivery model diverges from sales (e.g. separate fulfillment entity), a dedicated **GET /api/deliveries** could be added; for now, “deliveries” = sales with delivery info.
