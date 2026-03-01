/**
 * In-memory idempotency store for POST /api/sales.
 * Deduplicates retries with the same Idempotency-Key within TTL (same or cross-request within instance).
 * Not distributed: duplicate requests to different instances may both succeed. For full deduplication use Redis/DB.
 */
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 500;

interface Entry {
  body: Record<string, unknown>;
  expiresAt: number;
}

const store = new Map<string, Entry>();

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt <= now) store.delete(k);
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first != null) store.delete(first);
  }
}

/**
 * Return cached response body if key was used recently; otherwise null.
 */
export function getCachedResponse(idempotencyKey: string): Record<string, unknown> | null {
  const entry = store.get(idempotencyKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(idempotencyKey);
    return null;
  }
  return entry.body;
}

/**
 * Store response for this idempotency key. Call after successfully recording the sale.
 */
export function setCachedResponse(
  idempotencyKey: string,
  body: Record<string, unknown>
): void {
  prune();
  store.set(idempotencyKey, {
    body,
    expiresAt: Date.now() + TTL_MS,
  });
}
