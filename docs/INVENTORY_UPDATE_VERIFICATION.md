# Inventory update verification (multiple sizes / quantity by size)

This doc explains how we enforce that product inventory updates (especially **quantity by size**) stick, and how to verify the fix. It also clarifies that **no hardcoded values** override your update after a successful save.

---

## No hardcoded override after update

**There is no code path that hardcodes quantity or `quantityBySize` to zero or empty after a successful update.**

- **Frontend:** After a successful PUT, we build `finalProduct` from either the API response or the form payload (`updates.quantityBySize`). We never set `quantityBySize = []` or `quantity = 0` for the updated product after a successful response.
- **normalizeProduct:** Uses `quantityBySize: Array.isArray(p.quantityBySize) ? p.quantityBySize : []` only to **default** when the API omits the field; it does not run in a way that overwrites a just-saved product with empty sizes.
- **Form defaults:** `ProductFormModal` initializes new products with `quantityBySize: []` and `quantity: 0` only when **creating** a new product or when switching to "No sizes"; it does not reset the list after an update.

The only way the UI could “revert” to old values was:

1. **Race:** A background `loadProducts()` finished *after* your update and called `setProducts(merged)` with **stale API data**, overwriting the product we had just set.
2. **Cache short-circuit:** `loadProducts()` sometimes returns early with `setProducts(cached.data)`; if that cache were ever stale for the updated product, it could overwrite.

We fixed both so that a just-updated product is never overwritten for 60 seconds, regardless of cache or in-flight API.

---

## Safeguards that enforce the update

| Safeguard | Where | What it does |
|-----------|--------|----------------|
| **Ref before state** | `InventoryContext.updateProduct` | We set `lastUpdatedProductRef.current = { product: finalProduct, at }` **before** `setApiOnlyProductsState(newList)`. Any in-flight `loadProducts()` that merges will see this ref and keep the updated product instead of stale API data. |
| **Merge on API path** | `InventoryContext.loadProducts` | When building `merged` from the API, we do: if `lastUpdatedProductRef` is set and within `RECENT_UPDATE_WINDOW_MS` (60s), replace the product in `merged` with `updated.product` before calling `setProducts(merged)`. |
| **Merge on cache path** | `InventoryContext.loadProducts` | When serving from cache (`cacheValid && cached.data.length > 0`), we now apply the same rule: if we're within the recent-update window, we overwrite the updated product slot in the cached list with `lastUpdatedProductRef.product` before calling `setProducts(listToSet)`. So no code path can overwrite a just-updated product with stale data. |
| **PUT response includes sizes** | `warehouse-pos/inventory-server/lib/data/warehouseProducts.ts` | After the atomic RPC, if `getWarehouseProductById` returns empty or synthetic `quantityBySize`, we set `out.quantityBySize` from the saved `pQuantityBySize` so the client always receives the sizes that were just persisted. |
| **Size codes (EU20–EU22)** | Migration `20250219210000_seed_size_codes_eu20_eu22.sql` | The trigger `enforce_size_rules` requires every `size_code` to exist in `size_codes`. Without EU22 (and EU20, EU21), saves that include those sizes would fail and the list would never update. The migration adds those codes so such updates succeed. |

---

## Verification checklist

Use this to confirm that inventory updates are enforced and that nothing overrides your change.

### Prerequisites

1. **Apply the size_codes migration** (if not already applied):
   - Run migration `20250219210000_seed_size_codes_eu20_eu22.sql`, or manually:
     ```sql
     insert into size_codes (size_code, size_label, size_order) values
       ('EU20', 'EU 20', 67), ('EU21', 'EU 21', 68), ('EU22', 'EU 22', 69)
     on conflict (size_code) do nothing;
     ```
2. Deploy or run the latest frontend and inventory-server (with the ref-before-state fix, cache-path merge, and PUT response fix).

### Steps

1. **Multiple sizes – happy path**
   - Open Inventory, pick a product that has **Multiple sizes** (e.g. EU22–EU29).
   - Edit it, change some **quantity by size** values (e.g. set EU24 = 5, EU25 = 3).
   - Click **Update product**.
   - **Expect:** Success toast; modal closes; the table row shows the new quantities and they **do not** revert after a few seconds or after a background refresh.
   - Optional: wait for the next background refresh (e.g. 30s) or click a refresh control; the row should still show the same updated quantities.

2. **No revert from cache**
   - After an update, quickly switch warehouse (if you have multiple) and then switch back to the same warehouse so the list is re-served from cache.
   - **Expect:** The updated product still shows the new quantities (cache path now merges `lastUpdatedProductRef`).

3. **API returns correct sizes**
   - After an update, open the same product again in the edit modal.
   - **Expect:** The "Quantity by size" section shows the same values you just saved (no reset to 0 or empty).

4. **Sizes that were failing (e.g. EU22)**
   - Edit a product that has EU22 (or add EU22 as a size), set a quantity, save.
   - **Expect:** Save succeeds and the list shows the new quantity; no trigger error about `size_code ... does not exist in public.size_codes`.

If any step fails, check: (a) migration applied, (b) latest frontend and server deployed, (c) browser cache/hard refresh, (d) network tab for PUT 200 and response body containing `quantityBySize` with your sizes.

---

## Constants that affect the behaviour

- **RECENT_UPDATE_WINDOW_MS** (60_000): Time window during which a product is considered “just updated”; during this time, neither the API merge nor the cache short-circuit will overwrite it.
- **SIZE_UPDATE_COOLDOWN_MS** (20_000): Silent refresh is skipped for this period after a size update to reduce the chance of an in-flight request overwriting.
- **PRODUCTS_CACHE_TTL_MS** (60_000): Cache is considered valid for this period; when valid, `loadProducts` can return early from cache but now still applies `lastUpdatedProductRef` before setting state.

None of these hardcode quantity or `quantityBySize` to zero; they only control when we **preserve** the updated product over API or cache data.
