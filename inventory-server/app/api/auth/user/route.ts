import { NextResponse } from 'next/server';

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

export async function GET() {
  const user = stubUser('user@warehouse.local');
  return NextResponse.json(user);
}
