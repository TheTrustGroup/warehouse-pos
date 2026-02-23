# Product images

How product images are uploaded, stored, and displayed.

## Canonical flow

- **ProductModal** (Inventory) uses **client-side upload** via `src/lib/imageUpload.ts`:
  - **Primary:** Supabase Storage (`uploadProductImage()`). Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the app `.env`.
  - **Fallback:** If Storage is not configured or the request fails, images are stored as base64 data URLs in `product.images[]`. They work offline but are not ideal for production (DB size, no CDN).

- **Server route** `POST /api/upload/product-image` exists for server-side upload (e.g. admin tools). ProductModal does not use it by default.

## Environment

| Variable | Required for Storage upload | Description |
|----------|----------------------------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key for Storage auth |

Without these, uploads in ProductModal fall back to base64. The UI shows a warning when any image is stored as “local” (base64).

## Backend

- **Database:** `warehouse_products.images` (JSONB array of strings). Added by migration `20250222130000_master_sql_v2.sql`.
- **Storage bucket:** `product-images` (public read, auth upload/delete). Created by the same migration. Max file size 2MB; MIME types: JPEG, PNG, WebP, GIF.
- **API:** Create/update product accepts `images: string[]`. Server normalizes to max 5 items and max 8MB per entry.

## Security

- **Display:** Only Supabase Storage URLs (same origin + `product-images` bucket) and `data:` URLs are used as `img` `src`. Other URLs are replaced with a placeholder. See `safeProductImageUrl()` in `src/lib/imageUpload.ts`.

## Setup checklist

1. Run migrations in order so `warehouse_products.images` and the `product-images` bucket exist.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend `.env` for persistent image hosting.
3. Re-upload any “local” (base64) images after configuring Storage so they are stored in the bucket.
