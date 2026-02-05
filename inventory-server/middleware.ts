import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Allowed origins for CORS (comma-separated in env, or * for any). Frontend must be allowed to call this API. */
const getAllowedOrigins = (): string[] => {
  const raw = process.env.CORS_ORIGINS;
  if (raw === '*') return ['*'];
  if (raw) return raw.split(',').map((o) => o.trim()).filter(Boolean);
  // Vercel: allow same-deployment preview/production URL when CORS_ORIGINS not set
  const v = process.env.VERCEL_URL;
  if (v) return [`https://${v}`, `https://www.${v}`];
  return [];
};

function corsHeaders(request: NextRequest): HeadersInit {
  const origins = getAllowedOrigins();
  const origin = request.headers.get('origin') || '';
  // With credentials, browser requires a specific origin (not *). Prefer reflecting request origin.
  let allowOrigin: string;
  if (origins.includes('*') || origins.length === 0) {
    allowOrigin = origin || '*';
  } else {
    allowOrigin = origins.includes(origin) ? origin : origins[0];
  }
  const headers: HeadersInit = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
  };
  // Required when frontend sends credentials: 'include'
  if (allowOrigin !== '*') {
    (headers as Record<string, string>)['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/') || request.nextUrl.pathname.startsWith('/admin/api/')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
    }
    const res = NextResponse.next();
    Object.entries(corsHeaders(request)).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*', '/admin/api/:path*'] };
