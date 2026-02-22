/**
 * Central CORS config for API routes.
 * Use corsHeaders() on every response; use handleOptions() for OPTIONS.
 */

import { NextRequest } from 'next/server';

const ALLOWED_ORIGINS: string[] = [
  'https://warehouse.extremedeptkidz.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-request-id, Idempotency-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}
