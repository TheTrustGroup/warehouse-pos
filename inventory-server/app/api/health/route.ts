import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Health check for deploy verification and CI. No auth required. */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    db: 'unavailable',
    timestamp: new Date().toISOString(),
  });
}
