/**
 * Dashboard-only API fetch: deduplication, exponential backoff, and circuit breaker.
 * Does NOT use the global API circuit — dashboard failures must not disable sales/POS.
 * Used only for /api/dashboard and /api/dashboard/today-by-warehouse.
 */

import { getApiHeaders } from './api';

const MAX_RETRIES = 4;
const DASHBOARD_CIRCUIT_FAILURE_THRESHOLD = 3;
const DASHBOARD_CIRCUIT_COOLDOWN_MS = 60_000;

/** Dashboard-only circuit: 3 failures → block for 60s, then one probe. */
const dashboardCircuit = {
  failures: 0,
  lastFailureTime: 0,
  isOpen(): boolean {
    if (this.failures < DASHBOARD_CIRCUIT_FAILURE_THRESHOLD) return false;
    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed >= DASHBOARD_CIRCUIT_COOLDOWN_MS) {
      this.failures = 0;
      return false;
    }
    return true;
  },
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  },
  recordSuccess(): void {
    this.failures = 0;
  },
};

/** Seconds until circuit allows retry (for UI countdown). */
export function getDashboardCircuitRetryInSeconds(): number {
  if (dashboardCircuit.failures < DASHBOARD_CIRCUIT_FAILURE_THRESHOLD) return 0;
  const elapsed = Date.now() - dashboardCircuit.lastFailureTime;
  const remaining = DASHBOARD_CIRCUIT_COOLDOWN_MS - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function isDashboardCircuitOpen(): boolean {
  return dashboardCircuit.isOpen();
}

/** In-flight requests by URL so we don't fire duplicate requests. */
const inFlight = new Map<string, Promise<Response>>();

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Fetch with exponential backoff (2, 4, 8, 16 s), max 4 retries.
 * Deduplicates by URL: if a request is already in flight, returns the same promise.
 * Uses dashboard-only circuit; does not touch the global API circuit.
 */
async function fetchWithBackoff(
  baseUrl: string,
  path: string,
  signal?: AbortSignal | null
): Promise<Response> {
  const url = buildUrl(baseUrl, path);

  if (dashboardCircuit.isOpen()) {
    throw new Error(
      'Dashboard temporarily unavailable. Retry in a moment.'
    );
  }

  const run = async (): Promise<Response> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: getApiHeaders(),
          credentials: 'include',
          cache: 'no-store',
          signal: signal ?? undefined,
        });
        if (res.ok) {
          dashboardCircuit.recordSuccess();
          return res;
        }
        if (res.status === 500 || res.status === 503 || res.status === 504) {
          dashboardCircuit.recordFailure();
          if (attempt < MAX_RETRIES - 1) {
            const delayMs = Math.pow(2, attempt) * 1000;
            if (typeof console !== 'undefined' && console.warn) {
              console.warn(
                `[Dashboard] Attempt ${attempt + 1} failed (${res.status}). Retrying in ${delayMs / 1000}s...`
              );
            }
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
        }
        const msg = (await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`;
        throw new Error(typeof msg === 'string' ? msg : 'Request failed');
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) {
          const delayMs = Math.pow(2, attempt) * 1000;
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(
              `[Dashboard] Attempt ${attempt + 1} failed. Retrying in ${delayMs / 1000}s...`
            );
          }
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          throw lastError;
        }
      }
    }
    throw lastError ?? new Error('Dashboard request failed');
  };

  if (inFlight.has(url)) {
    return inFlight.get(url)!;
  }
  const promise = run().finally(() => {
    inFlight.delete(url);
  });
  inFlight.set(url, promise);
  return promise;
}

/**
 * GET dashboard JSON. Uses dedupe + backoff + dashboard circuit only.
 * Does not record failures to the global circuit breaker.
 */
export async function dashboardGet<T>(
  baseUrl: string,
  path: string,
  options?: { signal?: AbortSignal | null }
): Promise<T> {
  const res = await fetchWithBackoff(baseUrl, path, options?.signal);
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return null as T;
}
