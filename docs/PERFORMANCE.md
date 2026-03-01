# Performance recommendations (senior engineer)

Short checklist to keep the Inventory & POS app fast as data grows.

## Already in place

- **Server-side search** — Search and category are sent to the API (`q`, `category`). Backend filters by name, SKU, and barcode (with `ilike` escaping). Debounced 300ms so we don’t refetch on every keystroke.
- **Image resize before save** — Uploads are resized (max 800px), compressed (quality 0.78), and capped at ~200KB so payloads stay small.
- **Lazy images** — Product grid and modal use `loading="lazy"` so images load as they enter the viewport.
- **Polling** — 30s interval, only when tab is visible; no requests when modal is open.

## Recommended next steps

1. ~~**Server-side search**~~ **Done.** `q` and `category` are sent; initial load uses `PAGE_SIZE` (50) and "Load more" appends the next page. Send `q` (and optionally `category`) to `GET /api/products?warehouse_id=...&q=...` so the backend filters. Use a smaller `limit` (e.g. 50) and pagination or “Load more” so the first paint doesn’t fetch 1000 products.

2. ~~**Smaller initial load**~~ **Done.** Default `limit` is 50; "Load more" uses `offset` and same `q`/`category`. (Was: smaller initial load  
   Reduce default `limit` from 1000 to 50–100 and add “Load more” or infinite scroll. Combine with server-side search so users get fast first results.

3. **List payload**  
   If the list response is heavy (e.g. full descriptions, many images), add a “list” shape that returns only list-needed fields (id, name, sku, barcode, category, sellingPrice, quantity, one thumbnail URL).

4. **Virtualization**  
   For very long lists (500+ items), use a virtual list (e.g. `react-window`) so only visible rows are in the DOM.

5. **Caching**  
   Cache the product list in memory with a short TTL; invalidate on create/update/delete. Consider SWR or React Query for request deduplication and stale-while-revalidate.

6. **Poll interval**  
   If 30s is more than needed, consider 60s to reduce server load.
