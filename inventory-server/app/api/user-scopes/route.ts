import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { listScopesForEmail, setScopesForUser } from '@/lib/data/userScopes';

export const dynamic = 'force-dynamic';

/** GET /api/user-scopes?email=... — list store/warehouse scope for a user. Admin only. */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const email = request.nextUrl.searchParams.get('email')?.trim()?.toLowerCase();
    if (!email) {
      return NextResponse.json(
        { message: 'Query parameter email is required.' },
        { status: 400 }
      );
    }
    const scopes = await listScopesForEmail(email);
    return NextResponse.json({ scopes });
  } catch (e) {
    console.error('[api/user-scopes GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load user scopes' },
      { status: 500 }
    );
  }
}

/** PUT /api/user-scopes — set store/warehouse scope for a user. Admin only. Body: { email, scopes: [{ storeId, warehouseId }] } */
export async function PUT(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const email = body?.email?.trim()?.toLowerCase();
    if (!email) {
      return NextResponse.json(
        { message: 'Body must include email.' },
        { status: 400 }
      );
    }
    const raw = body?.scopes;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { message: 'Body must include scopes (array of { storeId, warehouseId }).' },
        { status: 400 }
      );
    }
    const scopes = raw
      .filter((s: unknown) => s && typeof s === 'object' && typeof (s as any).storeId === 'string' && typeof (s as any).warehouseId === 'string')
      .map((s: { storeId: string; warehouseId: string }) => ({ storeId: String(s.storeId).trim(), warehouseId: String(s.warehouseId).trim() }));
    await setScopesForUser(email, scopes);
    return NextResponse.json({ ok: true, scopes });
  } catch (e) {
    console.error('[api/user-scopes PUT]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to save user scopes' },
      { status: 500 }
    );
  }
}
