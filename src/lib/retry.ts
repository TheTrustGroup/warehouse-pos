/**
 * Retry a promise-returning function with exponential backoff.
 * @param fn - Function that returns a Promise (e.g. () => refreshStores())
 * @param maxAttempts - Maximum attempts including the first (default 3)
 * @param baseDelayMs - Initial delay between retries in ms (default 500)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
