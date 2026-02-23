# record_sale RPC contract (v2)

Used by **POST /api/sales** to atomically create a sale, insert sale lines, and deduct stock. Do not change the parameter order or line key names without a versioned API or new function name.

## Function signature

```sql
record_sale(
  p_warehouse_id   uuid,
  p_lines          jsonb,
  p_subtotal       numeric,
  p_discount_pct   numeric,
  p_discount_amt   numeric,
  p_total          numeric,
  p_payment_method text,
  p_customer_name  text DEFAULT NULL,
  p_sold_by        uuid DEFAULT NULL
)
RETURNS jsonb
```

## p_lines shape (camelCase)

Array of line objects. Keys must be **camelCase** (frontend and API use this; RPC reads these keys):

| Key         | Type   | Required | Description |
|------------|--------|----------|-------------|
| productId   | string | yes      | UUID of warehouse_products.id |
| sizeCode    | string \| null | no | Size code (e.g. "S", "M"); empty/null for non-sized |
| qty         | number | yes      | Quantity (integer, ≥ 1) |
| unitPrice   | number | yes      | Unit price |
| lineTotal   | number | no       | Line total (defaults to unitPrice × qty if omitted) |
| name        | string | no       | Product name at time of sale (default "Unknown") |
| sku         | string | no       | Product SKU |
| imageUrl    | string \| null | no | Product image URL (stored in sale_lines.product_image_url) |

Example:

```json
[
  {
    "productId": "uuid-here",
    "sizeCode": "M",
    "qty": 2,
    "unitPrice": 25.50,
    "lineTotal": 51,
    "name": "T-Shirt",
    "sku": "SKU-001",
    "imageUrl": "https://...supabase.co/storage/v1/object/public/product-images/..."
  }
]
```

## Return value (jsonb)

| Key        | Type   | Description |
|-----------|--------|-------------|
| id        | string | Sale UUID |
| receiptId | string | Human-readable receipt number (e.g. RCP-YYYYMMDD-NNNN) |
| total     | number | Sale total |
| itemCount | number | Total quantity of items |
| status    | string | `"completed"` |
| createdAt | string | ISO timestamp |

## Deprecated

- **Old signature** (parameter order): `p_warehouse_id, p_customer_name, p_payment_method, p_subtotal, p_discount_pct, p_discount_amt, p_total, p_lines` — no longer used. The API was updated to the order above; do not revert.
- **Snake_case in lines** (`product_id`, `size_code`, etc.): RPC v2 expects camelCase only.

## Migration

Defined in `inventory-server/supabase/migrations/20250222130000_master_sql_v2.sql`.
