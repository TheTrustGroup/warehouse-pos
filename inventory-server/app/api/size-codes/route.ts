import { NextResponse } from 'next/server';
import { getSizeCodes } from '@/lib/data/sizeCodes';

export const dynamic = 'force-dynamic';

/** GET /api/size-codes — list size codes for admin/POS (size selector). No auth required so POS can cache. */
export async function GET() {
  try {
    const list = await getSizeCodes();
    return NextResponse.json({ data: list });
  } catch (e) {
    console.error('[api/size-codes GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load size codes' },
      { status: 500 }
    );
  }
}
