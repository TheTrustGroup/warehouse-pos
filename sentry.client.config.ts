/**
 * Sentry client config for the Vite/React frontend.
 * Import and run initSentry() at the very top of main.tsx.
 * Do not send passwords, tokens, or Supabase keys — beforeSend scrubs them.
 */
import * as Sentry from '@sentry/react';

const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'auth',
  'bearer',
  'api_key',
  'apikey',
  'supabase',
  'service_role',
  'credentials',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((k) => lower.includes(k));
}

function scrubObj(obj: Record<string, unknown> | null | undefined): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (isSensitiveKey(key)) {
      (obj as Record<string, unknown>)[key] = '[REDACTED]';
    } else if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      scrubObj(obj[key] as Record<string, unknown>);
    }
  }
}

function getEnvironment(): 'production' | 'staging' | 'development' {
  const raw =
    (import.meta.env.VITE_APP_ENV as string | undefined) ||
    (import.meta.env.MODE as string) ||
    'development';
  const normalized = raw.toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return 'production';
  if (normalized === 'staging' || normalized === 'stage') return 'staging';
  return 'development';
}

export interface SentryClientOptions {
  /** When false, events are not sent (e.g. user has not consented). */
  shouldSend?: () => boolean;
}

export function initSentry(options: SentryClientOptions = {}): void {
  const enabled = import.meta.env.VITE_SENTRY_ENABLED as string | undefined;
  if (enabled === 'false' || enabled === '0') return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || typeof dsn !== 'string' || dsn.trim() === '') return;

  const { shouldSend } = options;

  Sentry.init({
    dsn,
    environment: getEnvironment(),
    sendDefaultPii: true,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: getEnvironment() === 'production' ? 0.1 : 1,
    replaysOnErrorSampleRate: 1,
    beforeSend(event) {
      if (shouldSend && !shouldSend()) return null;
      if (event.request?.headers) scrubObj(event.request.headers as unknown as Record<string, unknown>);
      if (event.request?.data) scrubObj(event.request.data as Record<string, unknown>);
      if (event.extra) scrubObj(event.extra as Record<string, unknown>);
      if (event.contexts) scrubObj(event.contexts as unknown as Record<string, unknown>);
      return event;
    },
  });
}
