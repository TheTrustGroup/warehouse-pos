/**
 * Observability: error reporting and health ping.
 * Plug in Sentry/LogRocket via reportError; health ping for availability.
 */

const HEALTH_CHECK_INTERVAL_MS = 60_000;

export interface ObservabilityConfig {
  /** Report errors to external service (e.g. Sentry). No-op if not provided. */
  reportError?: (error: Error, context?: Record<string, unknown>) => void;
  /** Health check URL (GET). Pinged periodically when app is active. */
  healthUrl?: string;
}

let config: ObservabilityConfig = {};

export function initObservability(c: ObservabilityConfig): void {
  config = { ...config, ...c };
}

/**
 * Report an error. Use in ErrorBoundary and catch blocks.
 * If VITE_SENTRY_DSN or similar is set, you can wire this to Sentry.captureException.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (config.reportError) {
    try {
      config.reportError(err, context);
    } catch (_) {
      if (import.meta.env.DEV) console.error('Observability reportError failed:', err);
    }
    return;
  }
  // When no external reporter, dev logging is done by errorReporting.reportError (single place)
}

/**
 * Ping health endpoint. Resolves to true if GET returns 2xx.
 */
export async function healthPing(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout?.(5000) ?? undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

let healthIntervalId: number | null = null;

/**
 * Start periodic health pings. Call once when app mounts.
 * Uses config.healthUrl.
 */
export function startHealthPings(): void {
  const url = config.healthUrl;
  if (!url || typeof url !== 'string') return;
  if (healthIntervalId != null) return;

  const ping = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    healthPing(url).catch(() => {});
  };

  ping();
  healthIntervalId = window.setInterval(ping, HEALTH_CHECK_INTERVAL_MS) as unknown as number;
}

export function stopHealthPings(): void {
  if (healthIntervalId != null) {
    clearInterval(healthIntervalId);
    healthIntervalId = null;
  }
}

/** Whether the API circuit breaker is currently open (degraded). */
export { getApiCircuitBreaker } from './circuit';
