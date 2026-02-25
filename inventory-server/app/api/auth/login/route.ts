import { NextRequest, NextResponse } from 'next/server';
import {
  getRoleFromEmail,
  setSessionCookie,
  sessionUserToJson,
  createSessionToken,
} from '@/lib/auth/session';
import { isPosRestrictedEmail, verifyPosPassword } from '@/lib/auth/posPasswords';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** Login: validate email (and POS password when applicable). Derive role from email (server-side). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || body.username || '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email) {
      return withCors(
        NextResponse.json({ error: 'Email is required' }, { status: 400 }),
        request
      );
    }

    if (isPosRestrictedEmail(email)) {
      if (!verifyPosPassword(email, password)) {
        return withCors(
          NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }),
          request
        );
      }
    }

    const role = getRoleFromEmail(email);
    const binding =
      body.warehouse_id != null || body.store_id !== undefined || body.device_id != null
        ? {
            warehouse_id: body.warehouse_id != null ? String(body.warehouse_id).trim() : undefined,
            store_id: body.store_id !== undefined ? body.store_id : undefined,
            device_id: body.device_id != null ? String(body.device_id).trim() : undefined,
          }
        : undefined;
    const sessionPayload = { email, role, exp: 0, ...binding };
    const sessionToken = await createSessionToken(email, role, binding);
    const response = NextResponse.json({
      user: sessionUserToJson(sessionPayload as import('@/lib/auth/session').Session),
      token: sessionToken,
    });
    await setSessionCookie(response, email, role, binding);
    return withCors(response, request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (process.env.NODE_ENV === 'production' && msg.includes('SESSION_SECRET')) {
      console.error('[auth] Login failed: SESSION_SECRET not set in production.');
      return withCors(
        NextResponse.json(
          { error: 'Server configuration error. Please contact the administrator.' },
          { status: 503 }
        ),
        request
      );
    }
    console.error('[auth] Login failed:', err);
    return withCors(
      NextResponse.json({ error: 'Login failed' }, { status: 400 }),
      request
    );
  }
}
