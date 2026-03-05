/**
 * GET /api/auth/user — return current user from Bearer or session cookie.
 * Frontend uses this for session check and to enrich warehouse_id for cashiers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth, sessionUserToJson } from '@/lib/auth/session';
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  const warehouseId = auth.warehouse_id ?? await getSingleWarehouseIdForUser(auth.email);
  const userPayload = {
    ...sessionUserToJson(auth),
    id: 'api-session-user',
    username: auth.email.split('@')[0] ?? 'user',
    ...(warehouseId ? { warehouse_id: warehouseId } : {}),
  };
  return withCors(NextResponse.json(userPayload, { status: 200, headers: h }), req);
}
