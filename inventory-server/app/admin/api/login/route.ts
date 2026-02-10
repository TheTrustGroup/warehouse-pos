import { NextRequest, NextResponse } from 'next/server';
import {
  getRoleFromEmail,
  setSessionCookie,
  sessionUserToJson,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Login: validate email, derive role from email (server-side only). Set session cookie; return user with that role. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || body.username || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const role = getRoleFromEmail(email);
    const response = NextResponse.json({
      user: sessionUserToJson({ email, role, exp: 0 }),
    });
    setSessionCookie(response, email, role);
    return response;
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 400 });
  }
}
