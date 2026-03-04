/**
 * POST /api/auth/login — validate email/password, return { user, token }.
 * Frontend also tries /admin/api/login first; both use same credential validation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { validateCredentials } from '@/lib/auth/credentials';
import { createSessionToken, setSessionCookieWithToken } from '@/lib/auth/session';
import { getSingleWarehouseIdForUser } from '@/lib/data/userScopes';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return withCors(
        NextResponse.json({ error: 'Invalid email or password', message: 'Email and password required' }, { status: 401, headers: h }),
        req
      );
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
    return withCors(
      NextResponse.json({ error: message, message }, { status: 401, headers: h }),
      req
    );
  }
}
