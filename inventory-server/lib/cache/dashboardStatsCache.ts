/**
 * Dashboard stats cache (Upstash Redis). Fail-safe: missing env or Redis errors
 * result in no-op / fallback to DB; never fail the request.
 */
import { Redis } from '@upstash/redis';

const CACHE_PREFIX = 'warehouse_stats';
const TTL_SECONDS = 30;

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

export function cacheKey(warehouseId: string): string {
  return `${CACHE_PREFIX}:${warehouseId}`;
}

/**
 * Get cached dashboard stats. Returns null on miss or any error (fail-safe).
 */
export async function getCached(warehouseId: string): Promise<unknown> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey(warehouseId));
    if (raw == null || typeof raw !== 'object') return null;
    return raw;
  } catch (e) {
    console.warn('[dashboardStatsCache] get failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Set dashboard stats in cache with TTL. No-op on error (fail-safe).
 */
export async function setCached(
  warehouseId: string,
  value: unknown,
  ttlSeconds: number = TTL_SECONDS
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cacheKey(warehouseId), value, { ex: ttlSeconds });
  } catch (e) {
    console.warn('[dashboardStatsCache] set failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * Invalidate cache for a warehouse. Call after sale or inventory edit so next request recomputes.
 * No-op when Redis is not configured or on error (fail-safe).
 */
export async function notifyInventoryUpdated(warehouseId: string): Promise<void> {
  if (!warehouseId?.trim()) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(cacheKey(warehouseId.trim()));
  } catch (e) {
    console.warn('[dashboardStatsCache] invalidate failed:', e instanceof Error ? e.message : e);
  }
}
