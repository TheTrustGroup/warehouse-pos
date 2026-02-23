import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders — list orders (auth required).
 * Returns empty array when this backend does not store orders (e.g. orders live in external system).
 * Prevents 405 when frontend calls this before/after login; additive, non-breaking.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  return NextResponse.json({ data: [] });
}
