# CDN and image optimization

How to get resized, fast product images (thumbnails in list/grid, full size in detail).

---

## 1. What’s already in place

- **`getProductImageUrl(url, size)`** in `src/lib/productImageUrl.ts`:
  - **Data URLs (base64):** returned as-is (no transform).
  - **Supabase Storage public URLs:** rewritten to Supabase’s [Image Transform](https://supabase.com/docs/guides/storage/serving/image-transformations) API so you get `thumb` (150×150), `medium` (400×400), or `full` (1200×1200) with `resize=cover`.
  - **Other HTTP(S) URLs:** returned as-is unless you add your own CDN logic in that file.

So the app is **ready** for Supabase Storage: once product images are stored there and the **public URL** is in `product.images[]`, the helper will automatically request resized versions.

---

## 2. How to use Supabase Storage (recommended path)

### 2.1 Prerequisites

- Supabase project (you already use it for DB).
- **Supabase Pro** (or higher) for [Storage Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) (resize on the fly).
- Product images stored as **URLs** (not only base64). If today you only store base64 in `warehouse_products.images`, you need to start storing Storage URLs (see below).

### 2.2 Steps

1. **Create a public bucket** named `product-images` in Supabase Dashboard → Storage. Set it to **public** so the app can build public URLs.

2. **Upload images to Storage when saving a product**
   - The **inventory-server** already does this: on **POST** and **PUT** `/api/products`, any base64 image in `body.images` is uploaded to the `product-images` bucket (path `{productId}/{uuid}.{ext}`) and the request body is updated with the public URL before saving to the DB. Existing HTTP(S) URLs in `images` are left unchanged.
   - So when the frontend sends base64 (e.g. from a file input or paste), the API uploads to Storage and stores the public URL. New and updated products will then get resized thumb/medium/full via the frontend helper.
   - For **existing** products that only have base64 in the DB: edit and save the product in the app (which triggers PUT with the same images; they’ll be uploaded and replaced with URLs), or run a one-off script that reads each product, uploads base64 to Storage, and updates the row.

3. **Frontend**
   - No change needed. The app already uses `getProductImageUrl(product.images[0], 'thumb')` in cards and can use `'medium'` / `'full'` in detail/lightbox. Any URL that matches the Supabase public object pattern will be rewritten to the render URL with size params.

4. **Optional: disable transforms**
   - If you need to turn off the transform (e.g. stay on original URLs), you can add an env check in `productImageUrl.ts` and skip calling `toSupabaseRenderUrl`, or add a feature flag.

---

## 3. URL shape the helper recognizes

The helper rewrites only URLs that look like:

```text
https://<project_ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
```

to:

```text
https://<project_ref>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=...&height=...&resize=cover
```

So as long as you put that **public object URL** in `product.images[]`, thumb/medium/full will be applied automatically.

---

## 4. Using another CDN (e.g. Cloudinary, imgix)

If you use a different image CDN:

1. Store the **CDN or origin URL** in `product.images[]` (e.g. `https://res.cloudinary.com/...` or your own domain).
2. In `src/lib/productImageUrl.ts`, add a branch that detects your CDN URL and appends the right params (e.g. `?w=150&h=150` or the provider’s format). Leave Supabase and data-URL handling as-is.

Example for a hypothetical “my-cdn.com” that supports `?w=` and `&h=`:

```ts
if (url.includes('my-cdn.com/')) {
  const { width, height } = SIZE_PARAMS[size];
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=${width}&h=${height}`;
}
```

---

## 5. Summary

| Step | Action |
|------|--------|
| 1 | Create a public Storage bucket (e.g. `product-images`) in Supabase. |
| 2 | On product create/update, upload images to that bucket and save the **public object URL** in `product.images[]`. |
| 3 | (Optional) Migrate existing base64 images to Storage and replace with URLs. |
| 4 | Frontend already uses `getProductImageUrl(..., 'thumb'|'medium'|'full')`; Supabase URLs will get resized automatically (Pro plan). |

For more on Supabase transforms (quality, format, resize modes), see [Storage Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).
