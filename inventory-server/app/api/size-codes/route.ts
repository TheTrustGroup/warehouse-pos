import { NextResponse } from 'next/server';
import { getSizeCodes } from '@/lib/data/sizeCodes';

export const dynamic = 'force-dynamic';

/** GET /api/size-codes — list size codes for admin/POS (size selector). No auth required so POS can cache. Ignores warehouse_id (size codes are global). */
export async function GET() {
  try {
    const list = await getSizeCodes();
    return NextResponse.json({ data: list });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[api/size-codes GET]', message);
    return NextResponse.json(
      { message: 'Size codes temporarily unavailable' },
      { status: 503 }
    );
  }
}
