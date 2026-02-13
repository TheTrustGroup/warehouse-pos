# Verifying saved inventory and warehouse filtering

## How to check if products were saved to the database

1. **Product list**  
   All products that were successfully saved to the server appear in the **Inventory** list. The list is loaded from the API and merged with any “local only” items, so you see both.

2. **“Local only” badge**  
   If a product was recorded while offline or the save to the server failed, it appears in the list with a **“Local only”** badge (and a cloud-off icon). Those items exist only on that device until they are synced.

3. **“Check if saved”**  
   For any product marked **“Local only”**, use the **“Check if saved”** button next to it. This re-fetches the product from the server. If it exists in the database, the badge is removed and the row is updated from the server. If it does not exist, the product remains “Local only” and you can use **“Sync to server”** (see below).

4. **Sync to server**  
   When the banner says “X item(s) on this device only”, click **“Sync to server”** to push those products to the database. After a successful sync, they will appear for all users and devices and the “Local only” badges disappear.

5. **Slow or uncertain saves**  
   - After adding a product, the UI shows “Product added successfully” only after the server has accepted the write.  
   - If the request is slow or times out, the product may still be saved on the server. Use **“Check if saved”** on that product (if it appears as “Local only”) or **Refresh** the list; if it appears from the API, it was saved.

## Warehouse filtering

- **Individual warehouse**  
  The Inventory list is always filtered by the **current warehouse**:
  - The header shows **“Warehouse: [name]”** so you know which warehouse you’re viewing.
  - The warehouse selector is in the top bar (store/warehouse area). Changing it reloads the product list for that warehouse.
  - Quantities and stock in the list are for the selected warehouse only.

- **All warehouses**  
  There is no single “all warehouses” product list. To see another warehouse’s inventory, switch the warehouse in the header dropdown; the list and quantities update for that warehouse.

- **API**  
  The product list API always receives a `warehouse_id` (from the selected warehouse, or a default). The backend uses it to return products with quantities for that warehouse only.
