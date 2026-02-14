import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Lightweight health check for warmup and keep-alive.
 * No auth required so cron and frontend warmup can hit it without credentials.
 */
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
