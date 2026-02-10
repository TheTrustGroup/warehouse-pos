import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sessionUserToJson } from '@/lib/auth/session';
import { getAssignedPosForUser } from '@/lib/data/userScopes';

export const dynamic = 'force-dynamic';

/** Current user from session. Role from server only. Includes assignedPos for POS UI. */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const payload = sessionUserToJson(auth);
  const assignedPos = await getAssignedPosForUser(auth.email);
  if (assignedPos) (payload as Record<string, unknown>).assignedPos = assignedPos;
  return NextResponse.json(payload);
}
