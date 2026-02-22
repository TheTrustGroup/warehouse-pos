/**
 * Central CORS config for API routes.
 * Use corsHeaders() on every response; use handleOptions() for OPTIONS.
 * Set ALLOWED_ORIGINS (comma-separated) in env to override defaults.
 */

import { NextRequest } from 'next/server';

const DEFAULT_ORIGINS = [
  'https://warehouse.extremedeptkidz.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const allowed = getAllowedOrigins();
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-request-id, Idempotency-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}
