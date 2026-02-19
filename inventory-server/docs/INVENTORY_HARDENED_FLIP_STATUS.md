# Status brief: Inventory hardened flip (one_size/na → sized)

**For Cursor AI and maintainers.** This doc summarizes the hardened path for atomically flipping products from “one size”/“no sizes” to “multiple sizes” with per-size quantities.

---

## What we tested

- Verified inventory **flip** from `one_size`/`na` to `sized` using the hardened function **`update_inventory_hardened`**.
- Ran two products end-to-end:
  - **51443928-6d26-481f-bce6-dc16be4ce242:** Pre-flipped `size_kind` to `sized`, then set per-size quantities (US9=4, US10=7). Final: `sized`, version=1, total=11.
  - **77523ea9-6425-4c11-8238-142dafe7af98:** True single-call flip with `update_inventory_hardened` using per-size input (US9=3, US10=5). Final: `sized`, version=6, total=8.

---

## What’s in place

- **Hardened path:** `update_inventory_hardened` works for **atomic flips** (`one_size`/`na` → `sized`) with per-size payloads.
- **Trigger/policy adjustments:**
  - `enforce_size_policy` and `enforce_size_rules` updated to trust **“hardened context”** (service/Edge Function) during transitional writes.
  - Strict validations remain for **normal client writes** (still enforce OS/NA for non-sized products and validate size codes).
- **Size code reference:** `size_codes` table controls valid codes (e.g. US9, US10, etc.).

---

## Why this helps editing inventory

Product managers (or automated jobs) can now:

- Send a **single request** with `quantity_by_size` to flip and set sizes atomically.
- Avoid interim OS/NA steps and manual pre-flips.
- Rely on **optimistic concurrency** via `p_expect_version` to prevent lost updates.

Normal clients remain protected by strict rules; only the hardened path can perform the flip safely.

---

## How to use

Call **`update_inventory_hardened`** with:

- `p_product_id`, `p_warehouse_id`
- `p_expect_version` — current version from `get_inventory_state`
- `p_quantity_by_size` — JSON array of `{ sizeCode, quantity }`
- `p_total_quantity` — `null` for sized writes

**Example payload:**

```json
[
  { "sizeCode": "US9", "quantity": 3 },
  { "sizeCode": "US10", "quantity": 5 }
]
```

---

## Related

- Product form (Multiple sizes): `warehouse-pos/src/components/inventory/ProductFormModal.tsx` — sends `quantityBySize`; ensure every row has a size code.
- Atomic update RPC (normal path): `update_warehouse_product_atomic` in migrations (e.g. `20250219000000_fix_update_atomic_empty_by_size_quantity.sql`).
- Size system overview: `warehouse-pos/docs/SIZE_SYSTEM.md`, `warehouse-pos/docs/SIZE_TYPE_AND_UI.md`.
