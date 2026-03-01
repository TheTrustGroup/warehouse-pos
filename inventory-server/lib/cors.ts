/**
 * Central CORS config for API routes.
 * Use corsHeaders() on every response; use handleOptions() for OPTIONS.
 * - ALLOWED_ORIGINS (comma-separated): exact origins to allow. Overrides defaults.
 * - ALLOWED_ORIGIN_SUFFIXES (comma-separated): hostname suffixes to allow (e.g. ".vercel.app").
 *   Request origin is allowed if its hostname ends with one of these (e.g. https://warehouse-pos-xxx.vercel.app).
 */

import { NextRequest } from 'next/server';

const DEFAULT_ORIGINS = [
  'https://warehouse.extremedeptkidz.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
];

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Hostname suffixes to allow (e.g. "vercel.app" allows *.vercel.app). */
const DEFAULT_ORIGIN_SUFFIXES = ['vercel.app', 'extremedeptkidz.com'];

function getAllowedSuffixes(): string[] {
  const raw = process.env.ALLOWED_ORIGIN_SUFFIXES?.trim();
  if (!raw) return DEFAULT_ORIGIN_SUFFIXES;
  return raw.split(',').map((s) => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
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
