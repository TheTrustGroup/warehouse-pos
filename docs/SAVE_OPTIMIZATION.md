# Save operations optimization

## Implemented

1. **Minimal payload** – POST/PUT product requests send only fields the backend persists (no `variants` or extra UI data). See `productToPayload` in `InventoryContext.tsx`.

2. **No redundant full reload** – After add/update, when the API returns a full product we update state from that response and do **not** call `loadProducts()` again, avoiding an extra GET round-trip.

3. **DB indexes** – Backend migration `20250213100000_indexes_products_category.sql` adds:
   - `idx_warehouse_products_category` – category filter
   - `idx_warehouse_products_name_lower` – name search
   Existing: `idx_warehouse_products_updated_at`, `idx_warehouse_products_sku`, `idx_warehouse_inventory_*`.

4. **Batching** – `syncLocalInventoryToApi` runs up to 5 POSTs in parallel instead of strictly sequential.

5. **Loading indicators** – Save button shows "Saving…" / "Verifying…" via `savePhase` from `InventoryContext` in `ProductFormModal`.

6. **No artificial delays** – No `setTimeout` or extra `await` in the save path; retry backoff in `apiClient` is intentional for transient failures.

7. **Profiling** – In dev, `performance.mark` / `performance.measure` are used around add/update API calls (`inventory-addProduct-api`, `inventory-updateProduct-api`) so you can inspect bottlenecks in the Performance tab.

8. **Real-time updates** – Polling via `useRealtimeSync` (e.g. 60s). A comment in that hook notes that **WebSocket** (e.g. Supabase Realtime) could replace polling for push-based updates and lower latency.

## Optional future improvements

- **Request compression** – For very large payloads, compress body (e.g. gzip) and set `Content-Encoding`; server would need to decompress. Usually unnecessary for single-product JSON.
- **Bulk create API** – Backend could expose `POST /api/products/bulk` and the frontend could use it in `syncLocalInventoryToApi` to send multiple products in one request.
- **WebSocket** – Supabase Realtime or custom WS to push product/order changes to clients instead of polling.
