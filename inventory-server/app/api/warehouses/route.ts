import { NextRequest, NextResponse } from 'next/server';
import { getWarehouses } from '@/lib/data/warehouses';
import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const list = await getWarehouses();
    return NextResponse.json(list);
  } catch (e) {
    console.error('[api/warehouses GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load warehouses' },
      { status: 500 }
    );
  }
}
