import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { voidRejection } from '@/lib/data/syncRejections';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** PATCH /api/sync-rejections/[id]/void — mark rejection as voided (admin only). No inventory change. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return withCors(NextResponse.json({ message: 'Rejection id required' }, { status: 400 }), request);
    }
    await voidRejection(id.trim());
    return withCors(NextResponse.json({ ok: true }), request);
  } catch (e) {
    console.error('[api/sync-rejections void PATCH]', e);
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Failed to void rejection' },
        { status: 500 }
      ),
      request
    );
  }
}
