/**
 * GET /api/auth/user — return current user from Bearer or session cookie.
 * warehouse_id is returned only when the user has exactly one warehouse in user_scopes
 * (so cashier/POS gets a bound warehouse and no selector). Multi-warehouse users (e.g. admin)
 * get no warehouse_id so the frontend shows the warehouse selector.
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
  const h = { ...corsHeaders(req), 'Cache-Control': 'private, no-store, max-age=0' };
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  // Only bind warehouse when user has exactly one in scope (cashier/POS). Multi-warehouse (admin) gets no warehouse_id so selector shows.
  // Ignore session warehouse_id so that even stale sessions get correct behavior (dropdown for info@).
  const warehouseId = await getSingleWarehouseIdForUser(auth.email);

  const userPayload = {
    ...sessionUserToJson(auth),
    id: 'api-session-user',
    username: auth.email.split('@')[0] ?? 'user',
    ...(warehouseId ? { warehouse_id: warehouseId } : {}),
  };
  return withCors(NextResponse.json(userPayload, { status: 200, headers: h }), req);
}
