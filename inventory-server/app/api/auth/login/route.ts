/**
 * POST /api/auth/login — validate email/password, return { user, token }.
 * Frontend also tries /admin/api/login first; both use same credential validation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { jsonError } from '@/lib/apiResponse';
import { checkLoginRateLimit } from '@/lib/ratelimit';
import { validateCredentials } from '@/lib/auth/credentials';
import { createSessionToken, setSessionCookieWithToken } from '@/lib/auth/session';
import { getSingleWarehouseIdForUser } from '@/lib/data/userScopes';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const rateLimit = await checkLoginRateLimit(req);
  if (rateLimit.limited) {
    return withCors(
      jsonError(429, 'Too many login attempts. Please try again later.', { code: 'RATE_LIMITED', headers: h }),
      req
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return withCors(jsonError(401, 'Email and password required', { headers: h }), req);
    }
    const user = validateCredentials(email, password);
    const warehouseId = await getSingleWarehouseIdForUser(user.email);
    const token = await createSessionToken(user.email, user.role, warehouseId ? { warehouse_id: warehouseId } : undefined);
    const userPayload = {
      id: 'api-session-user',
      email: user.email,
      username: user.email.split('@')[0] ?? 'user',
      role: user.role,
      warehouse_id: warehouseId ?? undefined,
    };
    const response = NextResponse.json(
      { user: userPayload, token },
      { status: 200, headers: h }
    );
    setSessionCookieWithToken(response, token);
    return withCors(response, req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid email or password';
    return withCors(jsonError(401, message, { headers: h }), req);
  }
}
