/**
 * Structured request logging for observability (Phase 3).
 * Logs 4xx/5xx and slow requests with requestId for correlation in Vercel/log aggregators.
 */
import type { NextRequest } from 'next/server';
import { getRequestId } from './apiResponse';

/** Log only when duration exceeds this (ms). */
const SLOW_MS = 2000;

export interface RequestLogMeta {
  path?: string;
  method?: string;
  message?: string;
  code?: string;
}

/**
 * Log one API response when status >= 400 or duration is above threshold.
 * One-line JSON so log pipelines can parse (e.g. Vercel, Datadog).
 */
export function logApiResponse(
  req: NextRequest,
  status: number,
  durationMs: number,
  meta?: RequestLogMeta
): void {
  const shouldLog = status >= 400 || durationMs >= SLOW_MS;
  if (!shouldLog) return;

  const requestId = getRequestId(req);
  const path = meta?.path ?? req.nextUrl?.pathname ?? req.url;
  const method = meta?.method ?? req.method ?? 'GET';

  const payload: Record<string, unknown> = {
    level: status >= 500 ? 'error' : 'warn',
    requestId,
    path,
    method,
    status,
    durationMs,
  };
  if (meta?.message) payload.message = meta.message;
  if (meta?.code) payload.code = meta.code;

  const line = JSON.stringify(payload);
  if (status >= 500) {
    console.error(line);
  } else {
    console.warn(line);
  }
}
