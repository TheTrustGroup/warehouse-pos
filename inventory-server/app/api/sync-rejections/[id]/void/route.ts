import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { voidRejection } from '@/lib/data/syncRejections';

export const dynamic = 'force-dynamic';

/** PATCH /api/sync-rejections/[id]/void — mark rejection as voided (admin only). No inventory change. */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = requireAdmin(_request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ message: 'Rejection id required' }, { status: 400 });
    }
    await voidRejection(id.trim());
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/sync-rejections void PATCH]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to void rejection' },
      { status: 500 }
    );
  }
}
