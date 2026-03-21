# Prompt: Replicate optimization, CDN, and Redis in another project

Use this prompt in Cursor in your **other project** to implement the same optimization/CDN and Redis (Upstash) patterns used in this warehouse-pos app.

---

## Copy-paste prompt for Cursor

```
Implement the same optimization, CDN, and Redis (Upstash) integration we use in our warehouse-pos project. Do the following.

---

### 1. Frontend / build optimization (Vite)

- **Code splitting:** In vite.config.ts, add rollupOptions.output.manualChunks so heavy libs load on demand: e.g. recharts → 'recharts', react/react-dom → 'react-vendor', react-router → 'router', dexie/idb → 'idb', framer-motion → 'framer'. Use chunkFileNames: 'assets/[name]-[hash].js' and assetFileNames: 'assets/[name]-[hash][extname]'.
- **Production build:** Use minify: 'terser', target: 'es2020', sourcemap: 'hidden'. Optionally terserOptions.compress: { drop_console: true }. Set chunkSizeWarningLimit (e.g. 600) if needed.
- **SPA + cache:** If deploying to Vercel, add vercel.json with rewrites: [{ "source": "/(.*)", "destination": "/index.html" }] and headers for "/" and "/index.html" with Cache-Control: no-store, no-cache, must-revalidate, max-age=0 so each deploy serves fresh HTML.

---

### 2. Image CDN / optimization (Supabase Storage or other)

- **Frontend helper:** Add a small lib (e.g. getProductImageUrl(url, size)) that:
  - Leaves data URLs (base64) unchanged.
  - For Supabase Storage public URLs (pattern: .../storage/v1/object/public/<bucket>/<path>), rewrite to the Image Transform API: .../storage/v1/render/image/public/<bucket>/<path>?width=W&height=H&resize=cover with sizes e.g. thumb 150x150, medium 400x400, full 1200x1200.
  - For other HTTP(S) URLs, return as-is (or add a branch for another CDN like Cloudinary with their resize params).
- **Backend:** On create/update of entities that have images, upload base64 images to a public Supabase Storage bucket (e.g. product-images), store the public object URL in the DB, and leave existing HTTP(S) URLs unchanged. Use a consistent path (e.g. {entityId}/{uuid}.{ext}).
- **Docs:** Add a short doc (e.g. CDN_AND_IMAGE_OPTIMIZATION.md) describing: Supabase Pro required for transforms; bucket must be public; frontend uses the helper everywhere (cards = thumb/medium, detail = full); optional note for using another CDN by extending the helper.

---

### 3. Redis (Upstash) integration — fail-safe, optional

- **Env:** Use UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. If missing, all Redis features are no-op; never fail requests because Redis is down or unset.
- **Lazy client:** In each Redis-using module, create the @upstash/redis client once (singleton), only when env is set; on any error (e.g. ping/set/get), log and fall back to DB or skip cache — never throw to the user.
- **Caches to add:**
  - **List/query cache** (e.g. products list): Key from params (warehouse_id, limit, offset, q, category, filters). TTL e.g. 5 minutes. On GET: try cache first; on miss, query DB, then set cache (optional: skip caching when payload > threshold, e.g. 512KB). On POST/PUT/DELETE that affect the list: invalidate all keys for that scope (e.g. SCAN + DEL by pattern like products:wh:{id}*). Do not cache “list view” or any response that must always reflect latest DB (e.g. real-time quantity); only cache grid/card views if applicable.
  - **Dashboard/stats cache:** Key per scope (e.g. warehouse_stats:{warehouseId}). TTL short (e.g. 30s). On GET dashboard: try cache; on miss, compute from DB and set. On any mutation that changes stats (sales, inventory edits): call invalidate (single DEL by key).
- **Response headers:** For cached list endpoints, set X-Redis: HIT | MISS | skip (reason) and optionally X-Cache: HIT/MISS so the frontend or monitoring can see cache behavior.
- **Health check:** In readiness route (e.g. GET /api/health/ready), optionally check Redis (ping); if Redis env is set and ping fails, return 503; if Redis env is not set, treat as “not configured” (e.g. omit from body or return redis: null).
- **Rate limiting (optional):** Use @upstash/ratelimit with the same Redis URL/token. E.g. fixed window (10 requests per 60s) for login; get client ID from x-forwarded-for or x-real-ip. If Redis is missing, skip rate limiting (allow request). Export checkLoginRateLimit(req) and call it in the auth route; when limited, return 429 with Retry-After.

---

### 4. Dependencies (backend)

- Add @upstash/redis and (if using rate limit) @upstash/ratelimit to the API/backend package.json. No Redis dependency in the frontend.

---

### 5. Summary of behaviors to preserve

- **Optimization:** Lazy routes + manual chunks, Terser, no-store for HTML, hashed asset names.
- **CDN:** One frontend helper for image sizes; backend uploads to Storage and stores public URLs; doc for Supabase + optional other CDN.
- **Redis:** Optional; env-based; list cache with TTL + invalidation on mutate; dashboard cache with short TTL + invalidation on stats change; list view (or equivalent) never cached; X-Redis header; readiness check; rate limit on login when Redis is set.
```

---

## Reference: where it lives in warehouse-pos

| Area | Location |
|------|----------|
| Vite chunks / build | `warehouse-pos/vite.config.ts` |
| vercel.json | `warehouse-pos/vercel.json` |
| Image URL helper | `warehouse-pos/src/lib/productImageUrl.ts` |
| CDN doc | `warehouse-pos/docs/CDN_AND_IMAGE_OPTIMIZATION.md` |
| Products list cache | `warehouse-pos/inventory-server/lib/cache/productsCache.ts` |
| Dashboard stats cache | `warehouse-pos/inventory-server/lib/cache/dashboardStatsCache.ts` |
| Rate limit | `warehouse-pos/inventory-server/lib/ratelimit.ts` |
| Products API (cache usage) | `warehouse-pos/inventory-server/app/api/products/route.ts` |
| Dashboard (cache usage) | `warehouse-pos/inventory-server/lib/data/dashboardStats.ts` |
| Readiness (Redis check) | `warehouse-pos/inventory-server/app/api/health/ready/route.ts` |
| Backend deps | `warehouse-pos/inventory-server/package.json` (@upstash/redis, @upstash/ratelimit) |

---

## Env vars to set in the other project

- **Upstash Redis:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (create a Redis database at upstash.com, copy REST URL and token).
- **Supabase (if using Storage + Image Transform):** existing `SUPABASE_URL` and service key; Supabase Pro for image transformations; public bucket for images.
