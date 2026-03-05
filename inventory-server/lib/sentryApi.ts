/**
 * Capture API route errors (4xx/5xx) in Sentry.
 * Use when returning error responses so we can filter by status and environment.
 * Do not pass passwords, tokens, or Supabase keys in extra.
 */
import * as Sentry from '@sentry/nextjs';

export function captureApiError(
  status: number,
  message: string,
  extra?: Record<string, unknown>
): void {
  const level = status >= 500 ? 'error' : status >= 400 ? 'warning' : 'info';
  if (status >= 500) {
    Sentry.captureException(new Error(message), {
      level: 'error',
      extra: { status, ...extra },
    });
  } else {
    Sentry.captureMessage(message, {
      level,
      extra: { status, ...extra },
    });
  }
}
