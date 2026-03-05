/**
 * Sentry edge config for Next.js (edge runtime).
 * Do not send passwords, tokens, or Supabase keys — beforeSend scrubs them.
 */
import * as Sentry from '@sentry/nextjs';

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
    process.env.VERCEL_ENV ??
    process.env.APP_ENV ??
    process.env.NODE_ENV ??
    'development';
  const normalized = String(raw).toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return 'production';
  if (normalized === 'staging' || normalized === 'stage') return 'staging';
  return 'development';
}

const dsn = process.env.SENTRY_DSN;

if (dsn && typeof dsn === 'string' && dsn.trim() !== '') {
  Sentry.init({
    dsn,
    environment: getEnvironment(),
    tracesSampleRate: getEnvironment() === 'production' ? 0.1 : 1,
    beforeSend(event) {
      if (event.request?.headers) scrubObj(event.request.headers as unknown as Record<string, unknown>);
      if (event.request?.data) scrubObj(event.request.data as Record<string, unknown>);
      if (event.extra) scrubObj(event.extra as Record<string, unknown>);
      if (event.contexts) scrubObj(event.contexts as unknown as Record<string, unknown>);
      return event;
    },
  });
}
