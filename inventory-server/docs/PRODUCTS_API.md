# Products API (clean, flat surface)

Official endpoints for products. All include sizes where applicable.

| Method | Path | Description |
|--------|------|-------------|
| **GET** | `/api/products` | List products with sizes (query: `warehouse_id`, `limit`, `offset`, `q`, `category`, `low_stock`, `out_of_stock`, `pos`) |
| **POST** | `/api/products` | Create product (body: product + optional `quantityBySize`) |
| **GET** | `/api/products/:id` | Get one product with sizes (query: `warehouse_id`) |
| **PUT** | `/api/products/:id` | Update product + sizes atomically |
| **DELETE** | `/api/products/:id` | Delete product |

Removed from the official surface (optional cleanup):

- ~~`GET /api/products/:id/inventory-by-size`~~ — use `GET /api/products/:id` (response includes `quantityBySize`).
- ~~`DELETE /api/products/bulk`~~ — use multiple `DELETE /api/products/:id` calls.
