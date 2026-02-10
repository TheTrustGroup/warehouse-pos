/**
 * Resilient API client: retries with exponential backoff, circuit breaker, AbortSignal.
 * Use this for all server calls that should tolerate transient failures.
 */

import { getApiHeaders } from './api';
import { getApiCircuitBreaker } from './circuit';

const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;

/** HTTP methods that are safe to retry (no body or idempotent). */
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Status codes that are worth retrying (transient). */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export interface ApiRequestOptions extends RequestInit {
  /** Base URL (no trailing slash). */
  baseUrl: string;
  /** Path (leading slash), e.g. /api/products */
  path: string;
  /** Optional idempotency key for POST/PUT/PATCH (retry-safe). */
  idempotencyKey?: string;
  /** Max retry attempts (default 3). Set 0 to disable retries. */
  maxRetries?: number;
  /** AbortSignal to cancel request (e.g. from useEffect cleanup). */
  signal?: AbortSignal | null;
  /** If true, do not use circuit breaker (e.g. health check). */
  skipCircuit?: boolean;
}

function isRetryable(method: string, status: number): boolean {
  if (RETRYABLE_METHODS.has(method)) return true;
  if (method === 'PUT' || method === 'PATCH') return RETRYABLE_STATUSES.has(status);
  if (method === 'POST') return RETRYABLE_STATUSES.has(status); // only retry on server errors
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  const ms = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
  return ms + Math.floor(Math.random() * 500);
}

/**
 * Execute a fetch with retries, backoff, and circuit breaker.
 * On circuit open throws with message indicating degraded mode.
 */
export async function apiRequest<T = unknown>(options: ApiRequestOptions): Promise<T> {
  const {
    baseUrl,
    path,
    idempotencyKey,
    maxRetries = DEFAULT_MAX_RETRIES,
    signal,
    skipCircuit = false,
    ...init
  } = options;

  const circuit = getApiCircuitBreaker();
  if (!skipCircuit && !circuit.allowRequest()) {
    throw new Error(
      'Server is temporarily unavailable. Using last saved data. Please try again in a moment.'
    );
  }

  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? getApiHeaders());
  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  const fetchOpts: RequestInit = {
    ...init,
    method,
    headers,
    credentials: init.credentials ?? 'include',
    signal: signal ?? undefined,
  };

  let lastError: Error | null = null;
  let attempt = 0;

  for (;;) {
    try {
      const res = await fetch(url, fetchOpts);

      if (res.ok) {
        circuit.recordSuccess();
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await res.json();
        }
        return null as T;
      }

      const body = await res.json().catch(() => ({ message: res.statusText }));
      const msg = body?.error ?? body?.message ?? `HTTP ${res.status}: ${res.statusText}`;
      const err = new Error(typeof msg === 'string' ? msg : 'Request failed') as Error & {
        status?: number;
        response?: Response;
      };
      err.status = res.status;
      err.response = res;
      lastError = err;

      if (res.status >= 500) circuit.recordFailure();

      const shouldRetry =
        maxRetries > 0 && attempt < maxRetries && isRetryable(method, res.status);

      if (!shouldRetry) {
        throw err;
      }

      attempt++;
      await delay(backoff(attempt));
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw e;
      }
      lastError = e instanceof Error ? e : new Error(String(e));
      circuit.recordFailure();

      const shouldRetry =
        maxRetries > 0 &&
        attempt < maxRetries &&
        (lastError?.message?.includes('fetch') ||
          /network|timeout|failed to fetch/i.test(lastError?.message || ''));

      if (!shouldRetry) {
        throw lastError;
      }
      attempt++;
      await delay(backoff(attempt));
    }
  }
}

/** GET with optional signal and retries. */
export function apiGet<T>(baseUrl: string, path: string, options?: { signal?: AbortSignal | null }): Promise<T> {
  return apiRequest<T>({ ...options, baseUrl, path, method: 'GET' });
}

/** POST with optional idempotency key and signal. */
export function apiPost<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  options?: { idempotencyKey?: string; signal?: AbortSignal | null }
): Promise<T> {
  return apiRequest<T>({
    ...options,
    baseUrl,
    path,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** PUT with optional signal. */
export function apiPut<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal | null }
): Promise<T> {
  return apiRequest<T>({
    ...options,
    baseUrl,
    path,
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** PATCH with optional signal. */
export function apiPatch<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal | null }
): Promise<T> {
  return apiRequest<T>({
    ...options,
    baseUrl,
    path,
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** DELETE with optional signal. */
export function apiDelete(
  baseUrl: string,
  path: string,
  options?: { signal?: AbortSignal | null }
): Promise<void> {
  return apiRequest({ ...options, baseUrl, path, method: 'DELETE' });
}
