/**
 * Products list cache (Upstash Redis). Fail-safe: missing env or Redis errors
 * result in no-op / fallback to DB; never fail the request.
 */
import { Redis } from '@upstash/redis';

const CACHE_PREFIX = 'products';
const TTL_SECONDS = 300; // 5 minutes

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis !== null) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

export interface ProductsCacheParams {
  warehouseId: string;
  limit: number;
  offset: number;
  q?: string;
  category?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
}

export function cacheKey(params: ProductsCacheParams): string {
  const { warehouseId, limit, offset, q, category, lowStock, outOfStock } = params;
  // Only include non-default / non-empty parts to keep keys readable
  const parts = [
    `wh:${warehouseId}`,
    `l:${limit}`,
    `o:${offset}`,
    q ? `q:${q}` : null,
    category ? `cat:${category}` : null,
    lowStock ? 'low:1' : null,
    outOfStock ? 'out:1' : null,
  ].filter(Boolean);
  return `${CACHE_PREFIX}:${parts.join('|')}`;
}

/**
 * Get cached products list. Returns null on miss or any error (fail-safe).
 */
export async function getCachedProducts(
  params: ProductsCacheParams
): Promise<unknown> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey(params));
    if (raw == null || typeof raw !== 'object') return null;
    return raw;
  } catch (e) {
    console.warn('[productsCache] get failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Set products list in cache with TTL. No-op on error (fail-safe).
 */
export async function setCachedProducts(
  params: ProductsCacheParams,
  value: unknown,
  ttlSeconds: number = TTL_SECONDS
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cacheKey(params), value, { ex: ttlSeconds });
  } catch (e) {
    console.warn('[productsCache] set failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * Invalidate ALL cached product lists for a warehouse.
 * Called after POST/PUT/DELETE so next GET recomputes from DB.
 * Uses SCAN to find and delete all keys matching products:wh:{warehouseId}*
 * No-op when Redis is not configured or on error (fail-safe).
 */
export async function notifyProductsUpdated(warehouseId: string): Promise<void> {
  if (!warehouseId?.trim()) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    const pattern = `${CACHE_PREFIX}:wh:${warehouseId.trim()}*`;
    let cursor = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = Number(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== 0);
  } catch (e) {
    console.warn('[productsCache] invalidate failed:', e instanceof Error ? e.message : e);
  }
}
