# Troubleshooting

## "Failed to load resource: The network connection was lost" on `/api/products`

**What you see:** Browser console shows the error when loading the dashboard or product list. The request URL is something like `https://your-api.vercel.app/api/products?warehouse_id=...&limit=1000`.

**Causes:**
1. **Serverless function timeout** — On Vercel, the default function execution limit is **10 seconds** (Hobby). If the database query for 1000 products takes longer (e.g. cold start + slow Supabase response), Vercel kills the request and the browser reports "connection was lost".
2. **Network drop** — Unstable connection between client and server.
3. **Backend error** — Server throws before sending a response.

**Fixes:**
- **Vercel:** The products route exports `maxDuration = 30` so GET /api/products can run longer. On Vercel **Hobby** the cap is 10s; on **Pro** you get up to 300s. If you still see "connection was lost", reduce `limit` (e.g. 200) or move to Pro.
- **Reduce payload:** Request fewer products (e.g. `limit=200`) or add pagination so the handler returns within the timeout.
- **Check backend logs** in Vercel Dashboard → your project → Logs to see if the function times out or errors.

---

## Uploaded image doesn't show in product form

**What you see:** After choosing an image in the product form, the preview stays empty or shows a broken image.

**Causes:**
1. **Blob URL revoked too early** — The preview briefly used a blob URL that was revoked before React switched to the final URL (Storage or data URL). Fixed by revoking in a microtask after state update.
2. **Storage URL not loading** — The image was uploaded to Supabase Storage but the preview request fails (e.g. CORS, 403). The form now uses `referrerPolicy="no-referrer"` and hides the `<img>` on error so broken images don't show an icon.
3. **Upload API failing** — If `POST /api/upload/product-image` returns 401/500, the form falls back to base64. If the network fails entirely, the fallback data URL is used; the preview should still show it.

**If it still happens:** Open DevTools → Network, upload an image, and check (1) whether `POST /api/upload/product-image` returns 200 and a `url`, and (2) whether a GET to that `url` returns 200. If the GET fails, check Supabase Storage bucket "product-images" is **public** and RLS allows public read.
