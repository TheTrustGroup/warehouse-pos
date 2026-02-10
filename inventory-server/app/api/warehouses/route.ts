import { NextResponse } from 'next/server';
import { getWarehouses } from '@/lib/data/warehouses';

export const dynamic = 'force-dynamic';

export async function GET() {
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
