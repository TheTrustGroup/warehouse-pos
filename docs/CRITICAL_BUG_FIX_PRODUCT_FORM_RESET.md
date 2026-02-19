# CRITICAL BUG FIX: Product form data resets after save

**Symptom:** After updating and saving a product in the inventory form, the UI briefly shows the update then reverts to the original values within a few seconds.

This doc maps each investigated root cause to the actual code and confirms how we prevent the revert.

---

## 1. OPTIMISTIC UI REVERT

**Risk:** Optimistic update sets state before API resolves, then overwrites with stale server response.

**Finding:** We do **not** use optimistic update for the product list on save. The list is updated only **after** the PUT succeeds:

- `InventoryContext.updateProduct`: we await `putProduct()`, then build `finalProduct` from API response (or form payload when API omits sizes), then `setApiOnlyProductsState(newList)`. No state is set before the API call.
- We **do** set `lastUpdatedProductRef` and then `setApiOnlyProductsState` so that any **in-flight** `loadProducts()` that completes later will see the ref and merge our product into its result instead of overwriting with stale API data.

**Fix in code:**

- `lastUpdatedProductRef.current = { product: finalProduct, at }` is set **before** `setApiOnlyProductsState(newList)` so any concurrent `loadProducts` merge uses the saved product.
- In `loadProducts`, after building `merged` from API (or cache), we replace the updated product with `lastUpdatedProductRef.product` when within `RECENT_UPDATE_WINDOW_MS` (60s).

**Files:** `src/contexts/InventoryContext.tsx` — `updateProduct`, `loadProducts` (API merge and cache path).

---

## 2. REAL-TIME SUBSCRIPTION OVERRIDE

**Risk:** WebSocket, Supabase subscription, or polling re-fetches and overwrites local state after save.

**Finding:** There is **no** WebSocket or Supabase Realtime subscription. There **is** a **polling** sync:

- `useRealtimeSync` in `InventoryContext` runs `loadProducts(undefined, { silent: true, bypassCache: true })` every `INVENTORY_POLL_MS` (30s).
- That can overwrite the list with API data if we didn’t protect the just-updated product.

**Fix:**

- **Silent refresh cooldown:** When `loadProducts` is called with `silent: true`, we skip the run if `lastSizeUpdateAtRef` is within `SIZE_UPDATE_COOLDOWN_MS` (20s). So for 20s after a size update we don’t poll.
- **Merge, don’t overwrite:** When `loadProducts` does run (API path or cache path), we **merge** `lastUpdatedProductRef` into the list: for 60s after a save, the updated product in the list is replaced with `lastUpdatedProductRef.product` before `setProducts`. So the poll **never** overwrites a just-saved product with stale data.

**Files:** `src/contexts/InventoryContext.tsx` (loadProducts silent cooldown + merge), `src/hooks/useRealtimeSync.ts` (poll only, no WS).

---

## 3. STALE STATE FROM PARENT RE-RENDER

**Risk:** Parent passes original product as props; after save, parent re-fetches and passes old cached value, form resets.

**Finding:**

- The **list** is the thing that “reverts” (the table/grid row), not the form. After save we call `onClose()` and the modal closes; the list is what stays visible.
- The list is driven by `products` from `InventoryContext` (single source of truth). We do **not** refetch after update; we set state from the PUT response (or form payload when API omits sizes). So the parent does not re-fetch and pass stale product to the list.
- **Form:** When the modal opens, `ProductFormModal` initializes `formData` from `product` in a `useEffect` that runs only when the modal **first** opens (`justOpened`), with deps `[isOpen]` only. So we do **not** re-initialize form from props when `product` changes while the modal is open. When the user reopens the modal later, `product` is the one from the list, which is already the updated product.

**Files:** `src/components/inventory/ProductFormModal.tsx` (init effect with `justOpened` and `[isOpen]`), `src/contexts/InventoryContext.tsx` (no refetch after update).

---

## 4. RACE CONDITION ON FETCH AFTER SAVE

**Risk:** A GET runs right after PUT and resolves with stale/cached data.

**Finding:**

- We **do not** trigger a GET (or `loadProducts`) after a successful PUT. Comment in code: “Do not refetch after update: API often omits images in GET, which would overwrite the list.”
- So there is no “GET immediately after PUT” race. The only way the list gets overwritten is by an **already in-flight** `loadProducts` (started before the PUT) or by a **later** poll. Both are handled by merging `lastUpdatedProductRef` and by the cache path also applying the same merge.

**Files:** `src/contexts/InventoryContext.tsx` — `updateProduct` (no `loadProducts`/refetch after success).

---

## 5. FORM STATE MANAGEMENT (reset / initialize)

**Risk:** React Hook Form / Formik `reset()` or `initialize()` called after save and resetting form.

**Finding:**

- We do **not** use React Hook Form or Formik. The product form uses plain `useState` (`formData`, `setFormData`).
- There is no `reset(`, `initialize(`, or `setValue(` in form-related code that would run after save. The only place that sets form state from “product” is the modal open effect, which runs only when the modal **first** opens (`justOpened`), not on every product change.

**Files:** `src/components/inventory/ProductFormModal.tsx` — useState only; init effect deps `[isOpen]`.

---

## Summary of safeguards

| Safeguard | Where | What it does |
|-----------|--------|----------------|
| Ref before setState | `updateProduct` | Set `lastUpdatedProductRef` before `setApiOnlyProductsState` so in-flight `loadProducts` sees the saved product. |
| Merge on API path | `loadProducts` | When building `merged` from API, replace the product with `lastUpdatedProductRef.product` if within 60s. |
| Merge on cache path | `loadProducts` | When serving from cache, apply the same replacement so cache never overwrites a just-saved product. |
| Silent poll cooldown | `loadProducts` | When `silent: true`, skip run if within `SIZE_UPDATE_COOLDOWN_MS` (20s) after a size update. |
| No refetch after save | `updateProduct` | We never call `loadProducts` or GET after a successful PUT. |
| Form init only on open | `ProductFormModal` | Form is initialized from `product` only when modal first opens (`[isOpen]`), not on every prop change. |

---

## Dev-only diagnostics

In development, the console will show:

- **After save:** `[Inventory] Product saved; list state updated. Recent-update window active for 60s so poll/refetch will not overwrite.` with `productId`.
- **When loadProducts preserves:** `[Inventory] loadProducts: preserved just-updated product in merge (avoids revert).` or `[Inventory] loadProducts (cache path): preserved just-updated product (avoids revert).`

Use these to confirm that after a save, any subsequent `loadProducts` (poll or cache) is preserving the updated product and not overwriting.

---

## Related

- `docs/INVENTORY_UPDATE_VERIFICATION.md` — verification checklist and “no hardcoded override” notes.
- Backend: PUT response fills `quantityBySize` from saved payload when read-back is empty; migration adds EU20–EU22 to `size_codes` so those sizes don’t fail the trigger.
