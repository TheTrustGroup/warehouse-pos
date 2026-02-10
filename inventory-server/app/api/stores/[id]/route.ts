import { NextRequest, NextResponse } from 'next/server';
import { getStoreById } from '@/lib/data/stores';
import { requireAuth } from '@/lib/auth/session';
import { resolveUserScope, isStoreAllowed, logScopeDeny } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';

/** GET /api/stores/[id] — single store. Scope: must be in allowed stores when user is scoped. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const store = await getStoreById(id);
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 });
    const scope = await resolveUserScope(auth);
    if (!isStoreAllowed(scope, store.id)) {
      logScopeDeny({ path: request.nextUrl.pathname, method: request.method, email: auth.email, storeId: id });
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(store);
  } catch (e) {
    console.error('[api/stores/[id] GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load store' },
      { status: 500 }
    );
  }
}
