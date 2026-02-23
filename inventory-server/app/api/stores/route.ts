import { NextRequest, NextResponse } from 'next/server';
import { getStores } from '@/lib/data/stores';
import { requireAuth } from '@/lib/auth/session';
import { resolveUserScope } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';

/** GET /api/stores — list stores. Admin: all. Non-admin: only stores in scope (empty = all for legacy). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const scope = await resolveUserScope(auth);
    const allowedStoreIds = scope.isUnrestricted ? undefined : scope.allowedStoreIds.length > 0 ? scope.allowedStoreIds : undefined;
    const list = await getStores(allowedStoreIds);
    return NextResponse.json(list);
  } catch (e) {
    console.error('[api/stores GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load stores' },
      { status: 500 }
    );
  }
}
