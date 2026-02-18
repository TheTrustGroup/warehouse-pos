# How size type works and where it shows

## Size type (form)

In the product form you choose one of:

| Option | Meaning | When to use |
|--------|--------|-------------|
| **No sizes** | Product has no size dimension. | Single-SKU items (e.g. accessories). |
| **One size** | One size only (e.g. “One size”, “OS”). | Items that don’t vary by size. |
| **Multiple sizes** | Several sizes, each with its own quantity. | Shoes (US6, US7…), apparel (S, M, L), etc. |

For **Multiple sizes** you add rows: size code (e.g. US6, W32, 6Y) and quantity per size. **Total stock** = sum of those quantities and is what you see in the **Stock** column and on the card (“X left”).

---

## Where it reflects after save/update

- **Table view**  
  - **Stock** column: total quantity.  
  - **Sizes** column:  
    - **Multiple sizes** → pills like `US6: 2`, `US7: 3`, `W32: 1`.  
    - **One size** → “One size”.  
    - **No sizes** → “—”.

- **Grid view**  
  - **Quantity** (“X left”) = total stock.  
  - **Sizes** row: same as above (pills for multiple, “One size” or “—” otherwise).

So yes: once you save or update a product with a size type and (for Multiple sizes) size rows, that **immediately reflects** in the product list **Size** column / card section. No extra refresh needed; the list is updated from the API response and from local state.

---

## Data and SQL

- **DB:**  
  - `warehouse_products.size_kind` = `'na' | 'one_size' | 'sized'`.  
  - For **sized**, `warehouse_inventory_by_size` stores one row per (warehouse, product, size_code) with `quantity`.  
  - Total quantity is also in `warehouse_inventory` for POS.

- **SQL:**  
  If you’ve already run the size migrations (e.g. `check_size_migrations_applied.sql` shows all four checks true), you **do not need to run anything else in SQL** for sizes to work. New/updated products with “Multiple sizes” will be stored and listed correctly.

- **Precision:**  
  Each size has its own quantity; the UI and API show those (US6, US7, W32, 6Y, etc.) and the total is always the sum of per-size quantities.
