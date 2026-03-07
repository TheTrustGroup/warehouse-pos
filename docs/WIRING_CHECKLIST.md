# Wiring checklist — POS, Sales, Deliveries, Void

Use this to confirm everything is connected end-to-end.

---

## 1. Frontend → API (all use `API_BASE_URL` from `src/lib/api.ts`)

| Flow | Frontend | API route | Status |
|------|----------|-----------|--------|
| **POS products** | POSPage `apiFetch('/api/products?warehouse_id=...')` | GET `inventory-server/app/api/products/route.ts` | ✅ |
| **POS charge** | POSPage `apiFetch('/api/sales', { method: 'POST', body })` | POST `inventory-server/app/api/sales/route.ts` | ✅ |
| **POS verify-stock** | POSPage `apiFetch('/api/products/verify-stock', ...)` | No route; 404 caught, sale proceeds; `record_sale` enforces stock | ⚠️ Optional |
| **Deliveries list** | DeliveriesPage `apiGet('/api/sales?warehouse_id=...&pending=true')` | GET same `sales/route.ts` | ✅ |
| **Mark dispatched/delivered/cancelled** | DeliveriesPage `apiPatch('/api/sales', { saleId, deliveryStatus, warehouseId })` | PATCH same `sales/route.ts` | ✅ |
| **Sales history list** | SalesHistoryPage `apiGet('/api/sales?warehouse_id=...&from=...')` | GET same `sales/route.ts` | ✅ |
| **Void sale** | SalesHistoryPage `apiPost('/api/sales/void', { saleId, warehouseId })` | POST `inventory-server/app/api/sales/void/route.ts` | ✅ |
| **Inventory** | InventoryContext, InventoryPage | GET/POST/PUT/DELETE `api/products` and `api/products/[...id]` | ✅ |
| **Warehouses** | WarehouseContext | GET `api/warehouses` | ✅ |

---

## 2. API → Supabase

| API | Supabase | Notes |
|-----|----------|--------|
| POST /api/sales | `record_sale(p_warehouse_id, p_lines, ..., p_delivery_schedule)` | 11-param RPC. Direct sale = deduct; delivery sale = reserve. |
| PATCH /api/sales (delivered) | `complete_delivery(p_sale_id)` | Deducts reserved stock, clears reservations. |
| PATCH /api/sales (cancelled) | `release_delivery_reservations(p_sale_id)` | Releases reservations only. |
| PATCH /api/sales (dispatched) | `sales.delivery_status = 'dispatched'` | No RPC. |
| POST /api/sales/void | `void_sale(p_sale_id)` | Restores stock or releases reservations. |
| GET /api/sales | `from('sales').select(...)` + `from('sale_lines')` | Returns list with lines, delivery_status, etc. |

---

## 3. Database (migrations)

- **Required for sales/delivery/void:** Run `inventory-server/supabase/migrations/20260306000000_sales_delivery_reserve_and_deduct.sql` in the Supabase SQL Editor (or via Supabase CLI).  
  Until this is run:
  - The old 10-param `record_sale` is dropped by the migration and replaced by the 11-param version.
  - If the migration has **not** been applied, POST /api/sales will fail with an RPC signature error.
- **Env:** Backend needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Frontend needs `VITE_API_BASE_URL` pointing at the deployed API (or `""` for same-origin).

---

## 4. Quick verification

1. **POS:** Log in → POS → add item → open cart → Charge. Should complete and show receipt (or clear error toast).
2. **Deliveries:** Create a sale with delivery details → Deliveries page shows it → Mark delivered (or cancelled). Stock should deduct on delivered, or release on cancelled.
3. **Void:** Sales History → Void a sale. Stock should return (or reservations released).
4. **API URL:** In production, set `VITE_API_BASE_URL` to your deployed inventory-server URL (e.g. Vercel). Build and redeploy frontend after changing env.

---

## Summary

| Area | Wired |
|------|--------|
| POS → server (products, sales) | ✅ |
| Deliveries → GET/PATCH sales | ✅ |
| Sales History → GET sales, POST void | ✅ |
| API → Supabase RPCs (record_sale, complete_delivery, release_delivery_reservations, void_sale) | ✅ |
| Migration 20260306000000 applied in Supabase | ⚠️ **You must run it** |
| verify-stock endpoint | Optional (POS proceeds without it; record_sale enforces stock) |
