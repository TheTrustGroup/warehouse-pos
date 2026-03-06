/**
 * GET /api/auth/user — return current user from Bearer or session cookie.
 * Frontend uses this for session check and to enrich warehouse_id so boundWarehouseId is set.
 * warehouse_id is resolved from user_scopes (single-warehouse = that ID; multi-warehouse = first in scope).
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth, sessionUserToJson } from '@/lib/auth/session';
import { getScopeForUser, getSingleWarehouseIdForUser } from '@/lib/data/userScopes';

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

  // Prefer warehouse_id from session (JWT payload); else resolve from user_scopes
  let warehouseId: string | undefined = auth.warehouse_id;
  if (!warehouseId) {
    const single = await getSingleWarehouseIdForUser(auth.email);
    if (single) {
      warehouseId = single;
    } else {
      const scope = await getScopeForUser(auth.email);
      warehouseId = scope.allowedWarehouseIds[0];
    }
  }

  const userPayload = {
    ...sessionUserToJson(auth),
    id: 'api-session-user',
    username: auth.email.split('@')[0] ?? 'user',
    ...(warehouseId ? { warehouse_id: warehouseId } : {}),
  };
  return withCors(NextResponse.json(userPayload, { status: 200, headers: h }), req);
}
