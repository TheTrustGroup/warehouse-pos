/**
 * GET /api/auth/user — session user with warehouse_id for POS.
 * Used by frontend to enrich cashier session so POS can send correct warehouse_id to /api/products.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, sessionUserToJson } from '@/lib/auth/session';
import { getSingleWarehouseIdForUser, getScopeForUser } from '@/lib/data/userScopes';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) {
    return withCors(
      NextResponse.json({ error: 'Unauthorized', message: 'Missing or invalid session' }, { status: 401 }),
      request
    );
  }

  let enriched = session;
  if (!session.warehouse_id) {
    const single = await getSingleWarehouseIdForUser(session.email);
    const warehouseId = single ?? (await getScopeForUser(session.email)).allowedWarehouseIds[0];
    if (warehouseId) {
      enriched = { ...session, warehouse_id: warehouseId };
    }
  }

  const body = sessionUserToJson(enriched);
  const res = withCors(NextResponse.json(body), request);
  res.headers.set('Cache-Control', 'private, max-age=0');
  return res;
}
