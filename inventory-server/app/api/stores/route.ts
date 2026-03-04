import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getStores } from '@/lib/data/stores';
import { requireAuth } from '@/lib/auth/session';
import { resolveUserScope } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/** GET /api/stores — list stores. Admin: all. Non-admin: only stores in scope (empty = all for legacy). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  try {
    const scope = await resolveUserScope(auth).catch(() => ({
      allowedStoreIds: [] as string[],
      allowedWarehouseIds: [] as string[],
      allowedPosIds: [] as string[],
      isUnrestricted: true,
    }));
    const allowedStoreIds = scope.isUnrestricted ? undefined : scope.allowedStoreIds.length > 0 ? scope.allowedStoreIds : undefined;
    const list = await getStores(allowedStoreIds);
    return withCors(NextResponse.json(list), request);
  } catch (e) {
    console.error('[api/stores GET]', e);
    const h = corsHeaders(request);
    return withCors(
      NextResponse.json(
        { message: 'Failed to load stores. Please try again.' },
        { status: 500, headers: h }
      ),
      request
    );
  }
}
