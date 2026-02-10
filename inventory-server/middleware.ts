import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Allowed origins for CORS (comma-separated in env, or * for any). Frontend must be allowed to call this API. */
const getAllowedOrigins = (): { origins: string[]; strict: boolean } => {
  const raw = process.env.CORS_ORIGINS;
  if (raw === '*') return { origins: ['*'], strict: false };
  if (raw) return { origins: raw.split(',').map((o) => o.trim()).filter(Boolean), strict: true };
  // When CORS_ORIGINS not set: allow request origin so frontend (e.g. warehouse.extremedeptidz.com) can call this API.
  const frontend = process.env.FRONTEND_ORIGIN;
  const vercel = process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`, `https://www.${process.env.VERCEL_URL}`] : [];
  const origins = [...vercel, ...(frontend ? [frontend.trim()] : [])];
  return { origins, strict: false };
};

function corsHeaders(request: NextRequest): HeadersInit {
  const { origins, strict } = getAllowedOrigins();
  const origin = request.headers.get('origin') || '';
  let allowOrigin: string;
  if (origins.includes('*') || origins.length === 0 || !strict) {
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
