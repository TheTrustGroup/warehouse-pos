# How to Call the Save Product API

Use these endpoints to create or update products. Sending **`sizeKind`** and **`quantityBySize`** correctly ensures sizes (S/M/L, etc.) are stored instead of falling back to ONESIZE.

---

## Base URL and auth

- **Base URL:** Your backend (e.g. `https://your-api.com` or `http://localhost:3000`).
- **Auth:** Requests must include your session (cookie or `Authorization` header) so the server can `requireAdmin` for POST/PUT.

---

## Create product (POST)

**URL:** `POST {baseUrl}/api/products?warehouse_id={warehouseId}`  
(or `POST {baseUrl}/admin/api/products?warehouse_id={warehouseId}`)

**Body (JSON):** same shape as below; for create, `id` is optional (server can generate).

**Example – product with multiple sizes (S/M/L):**

```json
{
  "name": "Air Force 1 (Black)",
  "sku": "AF1-BLK-001",
  "barcode": "",
  "category": "Footwear",
  "description": "",
  "tags": [],
  "quantity": 6,
  "costPrice": 50,
  "sellingPrice": 120,
  "reorderLevel": 2,
  "location": { "warehouse": "", "aisle": "", "rack": "", "bin": "" },
  "supplier": { "name": "", "contact": "", "email": "" },
  "images": [],
  "expiryDate": null,
  "createdBy": "admin",
  "sizeKind": "sized",
  "quantityBySize": [
    { "sizeCode": "S", "quantity": 1 },
    { "sizeCode": "M", "quantity": 2 },
    { "sizeCode": "L", "quantity": 3 }
  ],
  "warehouseId": "your-warehouse-uuid"
}
```

- **`sizeKind`** must be `"sized"` when you have multiple sizes.
- **`quantityBySize`** must be a non-empty array with `sizeCode` and `quantity`.  
- **`quantity`** should equal the sum of `quantityBySize` quantities (e.g. 1+2+3=6).  
- **`warehouseId`** can be in the body and/or `warehouse_id` in the query; both are used.

**Example – one-size product:**

```json
{
  "name": "Cap",
  "sku": "CAP-001",
  "sizeKind": "one_size",
  "quantity": 10,
  "quantityBySize": [],
  "warehouseId": "your-warehouse-uuid"
}
```

(Other fields same as above; `quantityBySize` can be `[]` or omitted for one_size.)

---

## Update product (PUT)

**URL:** `PUT {baseUrl}/api/products/{productId}?warehouse_id={warehouseId}`  
(or `PUT {baseUrl}/admin/api/products/{productId}?warehouse_id={warehouseId}`)

**Body (JSON):** same shape. Include **`version`** from the current product for optimistic locking (server returns 409 if version changed).

**Example – update to multiple sizes:**

```json
{
  "id": "existing-product-uuid",
  "name": "Air Force 1 (Black)",
  "sku": "AF1-BLK-001",
  "version": 3,
  "sizeKind": "sized",
  "quantityBySize": [
    { "sizeCode": "S", "quantity": 2 },
    { "sizeCode": "M", "quantity": 4 },
    { "sizeCode": "L", "quantity": 2 }
  ],
  "quantity": 8,
  "warehouseId": "your-warehouse-uuid"
}
```

---

## cURL examples

Create (sized):

```bash
curl -X POST "https://your-api.com/api/products?warehouse_id=YOUR_WAREHOUSE_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test S/M/L",
    "sku": "TST-001",
    "category": "Apparel",
    "quantity": 6,
    "sizeKind": "sized",
    "quantityBySize": [
      { "sizeCode": "S", "quantity": 1 },
      { "sizeCode": "M", "quantity": 2 },
      { "sizeCode": "L", "quantity": 3 }
    ],
    "warehouseId": "YOUR_WAREHOUSE_UUID"
  }'
```

Update (sized):

```bash
curl -X PUT "https://your-api.com/api/products/PRODUCT_UUID?warehouse_id=YOUR_WAREHOUSE_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "PRODUCT_UUID",
    "name": "Test S/M/L",
    "sku": "TST-001",
    "version": 1,
    "sizeKind": "sized",
    "quantityBySize": [
      { "sizeCode": "S", "quantity": 2 },
      { "sizeCode": "M", "quantity": 2 },
      { "sizeCode": "L", "quantity": 2 }
    ],
    "quantity": 6,
    "warehouseId": "YOUR_WAREHOUSE_UUID"
  }'
```

Replace `YOUR_WAREHOUSE_UUID` and `PRODUCT_UUID` with real IDs and add your auth (e.g. cookie) if required.

---

## Payload fields that affect sizes

| Field            | Required for sized | Notes |
|-----------------|--------------------|--------|
| `sizeKind`      | Yes                | `"sized"` = multiple sizes; `"one_size"` = single size; `"na"` = no sizes. |
| `quantityBySize` | Yes when sized     | Array of `{ "sizeCode": "S", "quantity": 1 }`. Must have at least one entry with non-empty `sizeCode` when `sizeKind === "sized"`. |
| `quantity`       | Yes                | Total stock; should match sum of `quantityBySize[].quantity` when sized. |
| `warehouseId`    | Yes                | Warehouse scope for inventory and by_size rows. |

If you send `sizeKind: "sized"` but **empty** `quantityBySize`, the API returns **400** with a message like: *"When size type is Multiple sizes, add at least one size row (e.g. S, M, L with quantities)."*

---

## How the app calls it

- **Create:** `apiPost(API_BASE_URL, '/api/products?warehouse_id=...', payload)` (or `/admin/api/products`).
- **Update:** `apiPut(API_BASE_URL, '/api/products/{id}?warehouse_id=...', payload)`.
- **Payload** is built by `productToPayload(product)`, which includes `sizeKind` and `quantityBySize` when the product has multiple sizes.

To share a real request: capture the **request URL** and **JSON body** from DevTools (Network tab) when you save a product from the UI, or use the cURL examples above and replace IDs.
