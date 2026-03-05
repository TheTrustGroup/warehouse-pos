/**
 * Sentry server-side init for Next.js API routes and server code.
 * Without this, Sentry.captureException/captureMessage in API routes never send.
 * Set SENTRY_DSN in env (local and production) for events to appear in Sentry.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  });
}
