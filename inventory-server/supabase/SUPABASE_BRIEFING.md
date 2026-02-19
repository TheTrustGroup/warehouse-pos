# Supabase briefing (inventory sizes)

**Purpose:** Single source of truth for what is enforced in Supabase so Cursor and migrations stay aligned.

---

## Server-side size enforcement (deployed)

### Trigger: `enforce_size_rules` on `warehouse_inventory_by_size`

- **When:** `BEFORE INSERT OR UPDATE`
- **Function:** `public.enforce_size_rules`
- **Logic:**
  - If product `size_kind` is **`'sized'`** → `size_code` must **NOT** be **`'OS'`** (must be a real size, e.g. S, M, L or EU sizes).
  - If product `size_kind` is **not** `'sized'` (i.e. `'na'` or `'one_size'`) → `size_code` must be **`'OS'`**.
  - **Validates** that `size_code` exists in `public.size_codes` (catalog-only; no custom size codes at insert/update).
- **Trigger name:** `trg_enforce_size_rules`

### Product metadata

- **CHECK constraint** on `public.warehouse_products.size_kind`: allowed values **only** `('na', 'one_size', 'sized')`.

### Size catalog

- **EU sizes:** `EU23`–`EU37` are seeded in `public.size_codes` with labels and ordering.
- **Verified:** 15 entries in that EU range.
- **Agreed:** Catalog limited to EU23–EU37 for now.

### Testing

- Invalid inserts (e.g. non-sized product with `size_code != 'OS'`) fail with clear errors.
- **Outcome:** Database guarantees consistent size semantics; bad data is prevented at the source.

---

## For Cursor / migrations

- Keep trigger logic aligned: **one-size = `'OS'` only**; **sized = any catalog size except `'OS'`**; **size_code must exist in `size_codes`**.
- Ensure `warehouse_products.size_kind` has CHECK `('na','one_size','sized')`.
- When adding or changing size codes, prefer the EU23–EU37 catalog for consistency unless otherwise specified.
- **One-size in DB:** Use catalog code **`OS`** only (not `One size` or `ONESIZE`). Backfill/scripts should insert `size_code = 'OS'` for one-size products.
