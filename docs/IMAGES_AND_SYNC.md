# Images and sync – what the message means

When sync fails, you may see:

**"Often connection, CORS, or request too large. Retry; sync omits large images to avoid size limits."**

## What it means

- **Connection** – The device couldn’t reach the server (network or server down).
- **CORS** – The server isn’t allowing requests from `warehouse.extremedeptkidz.com`; the browser blocks the request and reports a generic failure (e.g. “Load failed”).
- **Request too large** – The sync request body (all product data plus images as base64) exceeded the server’s limit (e.g. 4.5MB on Vercel). Big images make the body grow quickly; after a few products with large images, sync starts failing.

**“Sync omits large images”** means: when sending a product to the server, the app only includes images that are under ~100KB each (and at most 5). Any image over that size is **left out** of that sync request so the rest of the product can save. The product still syncs; you can add or replace images later via Edit.

---

## How to stay under the limit (automatic)

**New uploads are automatically resized.** When you add product images in the form:

1. Each file is **resized and compressed** before it’s stored.
2. The result is kept under **~100KB** per image so it will be included when syncing.
3. You can add up to **5 images** per product.

So **you don’t need to shrink images yourself** – the app does it. Only products that were added **before** this behavior (or with images added outside the form) might still have large images; for those, sync omits the large ones and sends the rest of the product.

---

## Rules (summary)

| Rule | Value | Where it’s applied |
|------|--------|--------------------|
| Max size per image | ~100KB (base64 length) | Add form: auto-compress. Sync: only include images under this. |
| Max images per product | 5 | Add form and sync |

If you see “Load failed” or the sync hint, try **Retry** first. If it keeps failing, check your connection and that the backend allows POST from the warehouse domain (see `SERVER_SIDE_FIX_GUIDE.md`).
