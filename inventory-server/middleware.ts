import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Default origins when no env is set (must match lib/cors.ts so CORS works without config). */
const DEFAULT_ORIGINS = [
  'https://warehouse.extremedeptkidz.com',
  'https://warehouse.hunnidofficial.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
];

/** Hostname suffixes to allow (e.g. vercel.app, extremedeptkidz.com). */
const DEFAULT_SUFFIXES = ['vercel.app', 'extremedeptkidz.com', 'hunnidofficial.com'];

function isOriginAllowed(origin: string, origins: string[], suffixes: string[]): boolean {
  if (!origin || !origin.startsWith('http')) return false;
  if (origins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (suffixes.some((s) => host === s || host.endsWith('.' + s))) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Allowed origins for CORS (comma-separated in env, or * for any). Frontend must be allowed to call this API. */
const getAllowedOrigins = (): { origins: string[]; suffixes: string[]; strict: boolean } => {
  const raw = process.env.CORS_ORIGINS ?? process.env.ALLOWED_ORIGINS;
  if (raw === '*') return { origins: ['*'], suffixes: [], strict: false };
  if (raw?.trim()) {
    const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
    return { origins: list, suffixes: [], strict: true };
  }
  const frontend = process.env.FRONTEND_ORIGIN?.trim();
  const vercel = process.env.VERCEL_URL
    ? [`https://${process.env.VERCEL_URL}`, `https://www.${process.env.VERCEL_URL}`]
    : [];
  const origins = [...new Set([...DEFAULT_ORIGINS, ...vercel, ...(frontend ? [frontend] : [])])];
  const suffixRaw = process.env.ALLOWED_ORIGIN_SUFFIXES?.trim();
  const suffixes = suffixRaw
    ? suffixRaw.split(',').map((s) => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean)
    : DEFAULT_SUFFIXES;
  return { origins, suffixes, strict: false };
};

function corsHeaders(request: NextRequest): HeadersInit {
  const { origins, suffixes, strict } = getAllowedOrigins();
  const origin = (request.headers.get('origin') ?? '').trim();
  // With credentials, browser requires exact origin. Reflect request origin only when allowed.
  let allowOrigin: string;
  if (origins.includes('*')) {
    allowOrigin = '*';
  } else if (origin && /^https?:\/\//.test(origin)) {
    const allowed = isOriginAllowed(origin, origins, suffixes);
    allowOrigin = allowed ? origin : origins[0] ?? 'https://warehouse.extremedeptkidz.com';
  } else {
    allowOrigin = origins[0] ?? 'https://warehouse.extremedeptkidz.com';
  }
  const headers: HeadersInit = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Accept, X-Requested-With, Idempotency-Key, x-request-id, x-correlation-id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
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
