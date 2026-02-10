import { NextRequest, NextResponse } from 'next/server';
import { getSession, requireAuth, sessionUserToJson } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Current user from session. Role is from server session only — never from client. */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(sessionUserToJson(auth));
}
