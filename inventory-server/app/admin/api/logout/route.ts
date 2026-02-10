import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookie(res);
  return res;
}
