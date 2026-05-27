# Product images (Extreme Dept Kidz / warehouse-pos)

**Supabase project:** `puuszplmdbindiesfxlr` (`https://puuszplmdbindiesfxlr.supabase.co`) — Main Store / Main Town warehouses. Not HunnidOfficial or other org projects.

## Architecture (single source of truth)

| Layer | Responsibility |
|--------|----------------|
| **Supabase Storage** `product-images` | Binary files; public `object/public` URLs |
| **`warehouse_products.images`** | JSONB array of **https** URLs only (no base64 in production) |
| **`src/lib/productImageUrl.ts`** | Display URLs, validation, bucket name |
| **`src/lib/imageUpload.ts`** | Client upload/delete only |
| **`inventory-server/lib/storage/productImages.ts`** | Server upload + `persistableProductImages()` |
| **`product_images_v1` (localStorage)** | Optional cache when API list omits images; **never overrides** API when API has URLs |

## Upload flow (ProductModal)

1. **Online:** `POST /api/upload/product-image` (service role) → then client Storage if needed.
2. **Offline only:** compressed base64 for later sync (server uploads on POST/PUT via `uploadProductImages`).
3. **On save:** API strips any remaining `data:` URLs with `persistableProductImages()` — Postgres is not used as image blob storage.

## Environment

| Variable | Where | Purpose |
|----------|--------|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | API (Vercel) | DB + Storage uploads |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend | Optional client-direct upload |
| `VITE_SUPABASE_IMAGE_TRANSFORMS` | Frontend | `true` only on Supabase **Pro** (resize URLs) |

## Setup checklist

1. Bucket `product-images` exists and is **public** (migration `20250222130000_master_sql_v2.sql`).
2. API and frontend Supabase URLs both point to **`puuszplmdbindiesfxlr`**.
3. Legacy base64 in DB (if any): `npm run migrate:base64-images` from `warehouse-pos/` (requires `inventory-server/.env.migration`).

## Display

- Inventory/POS use `getProductImageUrl(src, 'thumb' \| 'medium' \| 'full')`.
- List API (`view=list`) returns at most one image; prefers Storage URLs over base64.
