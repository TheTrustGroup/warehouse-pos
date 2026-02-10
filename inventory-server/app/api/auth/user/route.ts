import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sessionUserToJson } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Current user from session. Role from server only. */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(sessionUserToJson(auth));
}
