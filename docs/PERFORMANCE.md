# Performance — indexing, pagination, realtime, assets, caching

**Purpose:** Document current behavior and decisions so the system stays fast as data grows.

---

## 1. Database indexing

**Migration:** `20260301110000_performance_indexes.sql` adds indexes for hot paths.

| Table | Index | Purpose |
|-------|--------|---------|
| `warehouse_inventory` | `(warehouse_id, product_id)` | Lookup by warehouse + product in record_sale, product list, manual fallback |
| `warehouse_inventory_by_size` | `(warehouse_id, product_id, size_code)` | Same for sized inventory |
| `sales` | `(warehouse_id, created_at DESC)` | GET /api/sales list by warehouse, newest first |
| `sale_lines` | `(sale_id)` | Join sales → sale_lines |
| `warehouse_products` | `(name)` | Product list ordered by name |
| `warehouse_products` | `(category)` | Filter by category |

**Apply:** Run the migration in Supabase. If any of these indexes already exist (e.g. from an earlier migration), `IF NOT EXISTS` avoids errors.

**When to add more:** If you add filters (e.g. by `created_at` on products, or full-text search on name/sku), add supporting indexes and document them here.

---

## 2. Pagination and list size

**Products (inventory / POS):**
- **API:** `GET /api/products` supports `limit` (default 500, max 2000 in code) and `offset`. Backend uses `.range(offset, offset + limit - 1)`.
- **Frontend:** Inventory and POS both request `limit=1000` in a single call. No cursor or “load more” yet.
- **Implication:** With &gt;1000 products per warehouse, the first load fetches 1000; the rest require either increasing limit (worse for latency/memory) or adding pagination (e.g. offset-based “next page” or cursor).
- **Recommendation:** For catalogs &lt;1000 products, current approach is fine. For larger catalogs, add either (a) cursor-based pagination (e.g. `created_at` + id) and “load more” in the UI, or (b) search-first UX so users don’t need the full list at once.

**Sales:**
- **API:** `GET /api/sales` uses `limit` (max 500) and `offset` and returns `.range(offset, offset + limit - 1)`. Proper server-side pagination.
- **Frontend:** If the app never requests more than one page at a time, no change needed. If it fetches “all” by looping, cap or add UI pagination.

---

## 3. Realtime subscriptions

**Current state:** No Supabase Realtime (or other) subscriptions are used in the codebase. No subscription cleanup or leak risk.

**If you add realtime later:** Prefer a single channel per page (e.g. `warehouse_id` or `product_id`), subscribe in `useEffect`, and in the effect cleanup call `channel.unsubscribe()` (and remove the channel if applicable). Avoid subscribing in a loop or without cleanup.

---

## 4. Images and assets

**Current state:**
- Product images are stored as URLs (e.g. in `warehouse_products.images` array and `sale_lines.product_image_url`). No server-side resize or transform in the app.
- Upload: `POST /api/upload/product-image` exists; storage and URL shape are implementation-specific.

**Recommendations:**
- Serve images from a CDN or storage with cache headers; keep API responses small (URLs only).
- If you add client-side thumbnails, use `loading="lazy"` and fixed dimensions to reduce layout shift and bandwidth.
- For very large catalogs, consider serving a single “hero” image URL per product in list views and full set on detail.

---

## 5. API response caching

**Current state:**
- **Idempotency:** POST /api/sales uses an in-memory cache keyed by `Idempotency-Key` (see DATA_INTEGRITY.md). Not HTTP caching.
- **GET responses:** No long-lived HTTP cache. We set:
  - `GET /api/health`: `Cache-Control: no-store, max-age=0` so health checks are not cached by proxies.
  - `GET /api/products`: `Cache-Control: private, max-age=0` so product list is not cached by the browser (always fresh for inventory/POS).

**When to add HTTP caching:** If you add read-only endpoints that change rarely (e.g. size codes, categories), you can set `Cache-Control: private, max-age=60` (or similar) and revalidate as needed. Do not cache product list or sales list with a long TTL without a strategy for invalidation.

---

## Checklist

- [ ] Apply `20260301110000_performance_indexes.sql` in Supabase.
- [ ] Keep product list limit at 1000 or add pagination when catalog grows.
- [ ] If adding realtime, subscribe in one place per view and unsubscribe in effect cleanup.
- [ ] Do not add long-lived cache for GET /api/products or GET /api/sales without invalidation.
