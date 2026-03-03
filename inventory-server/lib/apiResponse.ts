/**
 * Consistent API error shape and request id for observability (Phase 3).
 * Use in routes: getRequestId(req), jsonError(res, status, message, { code, requestId }).
 */
import { NextRequest, NextResponse } from 'next/server';

const REQUEST_ID_HEADER = 'x-request-id';

export function getRequestId(req: NextRequest): string {
  const fromHeader = req.headers.get(REQUEST_ID_HEADER)?.trim();
  if (fromHeader) return fromHeader;
  return crypto.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface ErrorPayload {
  error: string;
  message?: string;
  code?: string;
  requestId?: string;
}

/** Options for error payload (code, requestId, optional alternate message). */
export interface JsonErrorOptions {
  code?: string;
  requestId?: string;
  message?: string;
  headers?: HeadersInit;
}

/**
 * Build a JSON error body. Use for 4xx/5xx so clients and logs can correlate with requestId.
 */
export function jsonErrorBody(message: string, opts?: JsonErrorOptions): ErrorPayload {
  const body: ErrorPayload = { error: message };
  if (opts?.message && opts.message !== message) body.message = opts.message;
  if (opts?.code) body.code = opts.code;
  if (opts?.requestId) body.requestId = opts.requestId;
  return body;
}

/**
 * Create a NextResponse with JSON error body and optional headers (Cache-Control, x-request-id).
 */
export function jsonError(
  status: number,
  message: string,
  opts?: JsonErrorOptions
): NextResponse {
  const requestId = opts?.requestId;
  const body = jsonErrorBody(message, { ...opts, requestId });
  const res = NextResponse.json(body, { status, headers: opts?.headers });
  if (requestId) res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}
