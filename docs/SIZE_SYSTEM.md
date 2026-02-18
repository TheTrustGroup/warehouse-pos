# Product size system — single reference

This doc is the single place for how size type works in this codebase. Use it to avoid the issues we kept facing (sizes not showing, partial updates wiping size type, sync/mirror dropping size data).

---

## 1. There is no single "sizes" column

- **DB:** `warehouse_products.size_kind` (`na` | `one_size` | `sized`) and table `warehouse_inventory_by_size` (quantity per warehouse × product × size_code).
- **API/UI:** `sizeKind` + `quantityBySize[]` (e.g. `[{ sizeCode: 'S', quantity: 1 }, ...]`).
- Total stock is in `warehouse_inventory`; for `sized` products it should equal the sum of `quantityBySize`.

---

## 2. The three size types (inputs)

| Type        | `sizeKind`   | Meaning                    | Input / storage |
|------------|--------------|----------------------------|------------------|
| No sizes   | `na`         | No size dimension          | No size rows; stock is a single number. |
| One size   | `one_size`   | Single size (e.g. "One size") | No per-size breakdown; stock is a single number. |
| Multiple sizes | `sized`  | Several sizes with quantities | User adds rows: size code (S, M, L, US9, etc.) + quantity each; stored in `warehouse_inventory_by_size`. |

**Invariant:** If `sizeKind === 'sized'` then there must be at least one row in `warehouse_inventory_by_size` (or in the payload `quantityBySize`) for that product/warehouse. Backend and form validation enforce this.

---

## 3. Where it’s used

- **Form:** `ProductFormModal` — user picks size type; for "Multiple sizes" adds size rows. Validated by `productFormSchema` (refine: sized ⇒ at least one size row).
- **List (table/grid):** Sizes column shows pills (e.g. S×1, M×2) when `sizeKind === 'sized'` and `quantityBySize.length > 0`; "One size" or "—" otherwise.
- **API list:** `getWarehouseProducts` returns `sizeKind` and `quantityBySize` (with fallback to default warehouse when current warehouse has no by_size rows).
- **Create/update:** Backend builds row from `{ ...existing, ...body }`, validates "sized ⇒ at least one size row", and never overwrites `size_kind` to `na` on partial updates (safeguard).
- **Sync/offline:** `buildProductPayload` and `mirrorProductsFromApi` include `sizeKind` and `quantityBySize` so sync and offline list never drop size data.

---

## 4. Do’s and don’ts

- **Do** use the same `warehouseId` for list, create, and update when you care about sizes (or rely on the default-warehouse fallback for list).
- **Do** send `sizeKind` and `quantityBySize` in every create/update payload when the product is sized (form and sync already do this).
- **Do** validate "Multiple sizes ⇒ at least one size row" on client (form) and server (create/update).
- **Don’t** assume a single `sizes` column exists; there isn’t one.
- **Don’t** do full-object updates that omit `sizeKind`/`quantityBySize`; backend merges with existing and has safeguards, but sync and mirror now always send size fields.

---

## 5. Shared constants and helpers (frontend)

- **`src/lib/sizeConstants.ts`:** `SIZE_KINDS`, `SIZE_KIND_LABELS`, `isValidSizeKind()`, `normalizeSizeKind()`, `hasSizedQuantityBySize()`, `isOneSize()`. Use these for labels and for "does this product show size pills?" so logic stays in one place.

---

## 6. Backend validation

- Create and update both call `validateSizeKindAndQuantityBySize(sizeKind, quantityBySize)` and return 400 with a clear message if `sizeKind === 'sized'` but there are no valid size rows.

---

## 7. Files to touch when changing size behavior

- **Types/constants:** `src/types/index.ts` (Product), `src/lib/sizeConstants.ts`, `src/lib/validationSchemas.ts` (productFormSchema).
- **API:** `inventory-server/lib/data/warehouseProducts.ts` (bodyToRow, list merge, create/update, validateSizeKindAndQuantityBySize).
- **Sync/mirror:** `src/services/syncService.js` (buildProductPayload), `src/db/inventoryDB.js` (mirrorProductsFromApi).
- **UI:** `ProductFormModal`, `ProductTableView`, `ProductGridView` (Sizes column/card).
- **Docs:** This file, `SIZE_TYPE_AND_UI.md`, `SIZES_ROOT_CAUSE_AND_FIXES.md`.

Keeping this list and the invariants above in mind when changing size type or list/API/sync will prevent the same classes of bugs from coming back.

---

## 8. Edit vs add (no duplicate on save)

- When the user opens the form for an **existing product** (Edit), the modal passes **`editingProductId`** (that product’s id) on submit.
- The parent submit handler uses **`editingProductId ?? editingProduct?.id`**: if either is set, it always calls **`updateProduct(id, payload)`**, never `addProduct`. So saving an edit **updates the same product** and does not create a duplicate.
- The backend PUT uses the **URL id** (`/api/products/:id`) as the product to update; the body is merged with existing on the server. So the same product row is updated in the DB.
