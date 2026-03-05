/**
 * GET /api/sentry-test — trigger a test error for Sentry verification.
 * Remove or restrict this route in production.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  throw new Error('Sentry Next.js backend test error');
}
