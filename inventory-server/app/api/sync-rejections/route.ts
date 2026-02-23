import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { listRejections } from '@/lib/data/syncRejections';

export const dynamic = 'force-dynamic';

/** GET /api/sync-rejections — list failed offline sync attempts (admin only). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const { searchParams } = new URL(request.url);
    const voided = searchParams.get('voided'); // 'true' | 'false' | omit (all)
    const limit = searchParams.get('limit');
    const list = await listRejections({
      voidedOnly: voided === 'true' ? true : voided === 'false' ? false : undefined,
      limit: limit != null ? parseInt(limit, 10) : undefined,
    });
    return NextResponse.json({ data: list });
  } catch (e) {
    console.error('[api/sync-rejections GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to list sync rejections' },
      { status: 500 }
    );
  }
}
