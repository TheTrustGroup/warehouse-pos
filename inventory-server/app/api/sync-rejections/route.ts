import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { listRejections } from '@/lib/data/syncRejections';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** GET /api/sync-rejections — list failed offline sync attempts (admin only). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  try {
    const { searchParams } = new URL(request.url);
    const voided = searchParams.get('voided'); // 'true' | 'false' | omit (all)
    const limit = searchParams.get('limit');
    const list = await listRejections({
      voidedOnly: voided === 'true' ? true : voided === 'false' ? false : undefined,
      limit: limit != null ? parseInt(limit, 10) : undefined,
    });
    return withCors(NextResponse.json({ data: list }), request);
  } catch (e) {
    console.error('[api/sync-rejections GET]', e);
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Failed to list sync rejections' },
        { status: 500 }
      ),
      request
    );
  }
}
