import { NextRequest, NextResponse } from 'next/server';
import {
  getRoleFromEmail,
  setSessionCookie,
  sessionUserToJson,
  createSessionToken,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Login: validate email, derive role from email (server-side only). Optional binding: warehouse_id, store_id, device_id (not required). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || body.username || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
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
    const sessionToken = createSessionToken(email, role, binding);
    const response = NextResponse.json({
      user: sessionUserToJson(sessionPayload as import('@/lib/auth/session').Session),
      token: sessionToken,
    });
    setSessionCookie(response, email, role, binding);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (process.env.NODE_ENV === 'production' && msg.includes('SESSION_SECRET')) {
      console.error('[auth] Login failed: SESSION_SECRET not set in production.');
      return NextResponse.json(
        { error: 'Server configuration error. Please contact the administrator.' },
        { status: 503 }
      );
    }
    console.error('[auth] Login failed:', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 400 });
  }
}
