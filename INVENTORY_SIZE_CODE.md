# Inventory size codes

This document explains how **size codes** work in the warehouse + POS system: what they are, how they’re used, and why they improve speed and accuracy.

---

## What is `size_code`?

- **`size_code`** is the **system identifier** for a size: normalized, no spaces, stable in the database and API (e.g. `US9`, `M`, `W32`, `OS`, `NA`). Only codes present in the **`size_codes`** table are allowed (enforced by DB trigger) for consistent reporting and big-brand use.
- **`size_label`** is the **human‑readable** label (e.g. “US 9”, “Medium”, “One Size”). For predefined sizes from `size_codes`; for custom sizes the code is used as the label.
- **`size_order`** is an optional numeric value used to **sort** sizes in UIs (e.g. shoe sizes in order).

**Rules:**

- `size_code` is always normalized (no spaces; stored in `size_codes` and `warehouse_inventory_by_size`).
- Non‑sized products use **`NA`** (not applicable) or **`OS`** (one size).
- Existing inventory and schema are unchanged; size support is **additive only** (new tables/columns, no deletion of data or columns).

---

## How it’s used

### 1. Reference table: `size_codes`

- Holds the **predefined** size list: `size_code`, `size_label`, `size_order`. Used as dropdown/datalist suggestions in the product form.
- **Catalog-only:** The DB trigger `enforce_size_rules` requires every `size_code` in `warehouse_inventory_by_size` to exist in `size_codes`. Only these predefined codes are allowed when saving inventory by size (big-brand consistency and reporting).
- **Full catalog** (seeded for clothing, sneakers, shoes, all ages):
  - **Adult apparel:** NA, OS, XXS, XS–XXL, 2XL–5XL; W28–W40 (waist).
  - **Adult footwear:** US5–US15 (US), EU20–EU50 (EU), UK3–UK13 (UK).
  - **Kids/infant:** 0-3M–18-24M (infant months); 2T–8T (toddler); US1K–US13K (kids footwear); 6Y–14Y (youth clothing).
- Used by admin (product form) and POS to show consistent labels.

### 2. Per‑size inventory: `warehouse_inventory_by_size`

- Stores quantity per **(warehouse, product, size_code)**.
- Used when a product has **size_kind = `sized`** (multiple sizes).
- The **total** quantity for a product is still stored in **`warehouse_inventory`** so POS and existing flows keep using one total and do not slow down.

### 3. Product: `size_kind` on `warehouse_products`

- **`na`** – No sizes (e.g. non‑apparel). Use `NA` if you need a single “size” row.
- **`one_size`** – One size only (e.g. “One Size”). Use `OS` where needed.
- **`sized`** – Multiple sizes; quantities live in `warehouse_inventory_by_size` and the total is synced to `warehouse_inventory`.

### 4. API

- **GET /api/products** (and admin variant) returns:
  - **`sizeKind`**: `na` | `one_size` | `sized`
  - **`quantityBySize`** (when `sizeKind === 'sized'`): array of `{ sizeCode, sizeLabel?, quantity }`
- **GET /api/size-codes** returns the list of size codes (for dropdowns).
- **POST/PUT product** accepts **`sizeKind`** and **`quantityBySize`**; when `quantityBySize` is present and non‑empty, the backend treats the product as sized, writes per‑size rows, and sets the total in `warehouse_inventory`.

### 5. POS

- POS still uses **`quantity`** (total) for stock and deduction, so checkout is unchanged and fast.
- When a product has **`quantityBySize`**, POS can show only **sizes with available stock** (e.g. filter to `quantity > 0` by size) for a better, instant size selector.

---

## Why it improves speed and accuracy

- **Fast size lookup** – Inventory can be checked by size via `warehouse_inventory_by_size` and indexes; no need to scan or parse free text.
- **POS shows only available sizes** – Using `quantityBySize`, the UI can show only size options with stock, reducing errors and returns.
- **Consistent data** – Normalized `size_code` avoids duplicates and typos (e.g. “US 9” vs “US9” vs “9”).
- **Scalable** – Supports sneakers, clothing, kidswear, and non‑sized items (NA/OS) without changing existing inventory or breaking the current POS flow.

---

## Verification

- Add a product with **Multiple sizes** and several size rows; save completes quickly; sizes appear in the list and in admin.
- **Total quantity** matches the sum of per‑size quantities and is correct in `warehouse_inventory` and on POS.
- **Existing inventory** is untouched (no migration that deletes or alters existing rows in `warehouse_inventory` or `warehouse_products` beyond adding optional columns).
- **POS** remains fast: it still deducts from the total in `warehouse_inventory`; optional `quantityBySize` is for display only.
