/**
 * Central error reporting and dev logging.
 * - reportError: sends to external service when configured (e.g. Sentry) and logs to IndexedDB logger.
 * - logErrorForDev: logs to console only in development (for catch blocks that also show toast).
 *
 * Integration: In main.tsx, initObservability({ reportError: (err, ctx) => { Sentry?.captureException(err, { extra: ctx }); } })
 * to send errors to Sentry. When VITE_SENTRY_DSN is set, the placeholder in main can be replaced with real Sentry.
 */

import { reportError as observabilityReportError } from './observability';
import { logError } from '../utils/logger';

/**
 * Report an error to the configured service (e.g. Sentry) and log to IndexedDB for debugging.
 * Use in Error Boundaries and in catch blocks where you want errors tracked.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (import.meta.env.DEV) {
    console.error('[Error]', err, context);
  }
  logError(err, context);
  observabilityReportError(err, context);
}

/**
 * Log error to console in development only. Use in catch blocks that already show a user-facing toast
 * so we don't double-log to the external service (call reportError only when you want the service to receive it).
 */
export function logErrorForDev(error: unknown, context?: string | Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  const ctx = typeof context === 'string' ? { context } : context;
  console.error('[Error]', error, ctx ?? {});
}
