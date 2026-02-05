import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function stubUser(email: string) {
  const now = new Date().toISOString();
  return {
    id: 'api-stub-user',
    username: email.split('@')[0] || 'user',
    email,
    role: 'admin',
    fullName: email,
    isActive: true,
    lastLogin: now,
    createdAt: now,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || body.username || 'user@warehouse.local').trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    const user = stubUser(email);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 400 }
    );
  }
}
