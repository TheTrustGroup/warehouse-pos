import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sessionUserToJson } from '@/lib/auth/session';
import { getAssignedPosForUser, getSingleWarehouseIdForUser } from '@/lib/data/userScopes';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** Current user from session. Role from server only. Includes warehouse_id for cashier POS (skip location selector). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(request);
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    Object.entries(h).forEach(([k, v]) => auth.headers.set(k, v));
    return auth;
  }

  const payload = sessionUserToJson(auth);
  if (!payload.warehouse_id) {
    try {
      const singleWarehouseId = await getSingleWarehouseIdForUser(auth.email);
      if (singleWarehouseId) (payload as Record<string, unknown>).warehouse_id = singleWarehouseId;
    } catch {
      // table missing or DB error; leave warehouse_id unset
    }
  }
  const assignedPos = await getAssignedPosForUser(auth.email);
  if (assignedPos) (payload as Record<string, unknown>).assignedPos = assignedPos;
  return NextResponse.json(payload, { headers: h });
}
