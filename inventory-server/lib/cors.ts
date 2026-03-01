/**
 * Central CORS config for API routes.
 * Use corsHeaders() on every response; use handleOptions() for OPTIONS.
 * - ALLOWED_ORIGINS (comma-separated): extra origins; defaults (e.g. warehouse.extremedeptkidz.com) are always included.
 * - ALLOWED_ORIGIN_SUFFIXES (comma-separated): extra hostname suffixes; defaults (vercel.app, extremedeptkidz.com, hunnidofficial.com) are always included.
 *   Request origin is allowed if its hostname ends with one of these (e.g. https://warehouse-pos-xxx.vercel.app).
 */

import { NextRequest } from 'next/server';

/** Production frontends (same app, separate clients). Localhost for dev. */
const DEFAULT_ORIGINS = [
  'https://warehouse.extremedeptkidz.com',
  'https://warehouse.hunnidofficial.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
];

/** Origins are always DEFAULT_ORIGINS plus any from env (env cannot remove this app's origins). */
function getAllowedOrigins(): string[] {
  const fromEnv = process.env.ALLOWED_ORIGINS?.trim();
  const extra = fromEnv ? fromEnv.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

/** Hostname suffixes to allow (e.g. "vercel.app" allows *.vercel.app). */
const DEFAULT_ORIGIN_SUFFIXES = ['vercel.app', 'extremedeptkidz.com', 'hunnidofficial.com'];

/** Suffixes are always defaults plus any from env (env cannot remove this app's suffixes). */
function getAllowedSuffixes(): string[] {
  const raw = process.env.ALLOWED_ORIGIN_SUFFIXES?.trim();
  const extra = raw ? raw.split(',').map((s) => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean) : [];
  return [...new Set([...DEFAULT_ORIGIN_SUFFIXES, ...extra])];
}

function isOriginAllowed(origin: string, allowed: string[], suffixes: string[]): boolean {
  if (!origin || !origin.startsWith('http')) return false;
  if (allowed.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (suffixes.some((s) => host === s || host.endsWith('.' + s))) return true;
  } catch {
    // ignore invalid URL
  }
  return false;
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const allowed = getAllowedOrigins();
  const suffixes = getAllowedSuffixes();
  const origin = (req.headers.get('origin') ?? '').trim();
  // With credentials, browser requires exact origin in Allow-Origin (no *). Use request origin only when allowed.
  const allowOrigin = isOriginAllowed(origin, allowed, suffixes) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-request-id, Idempotency-Key, X-Requested-With, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
