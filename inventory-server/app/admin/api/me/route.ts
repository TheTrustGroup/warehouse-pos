import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Stub user for warehouse API when no separate auth backend. Frontend normalizes with ROLES. */
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
  // Accept any session; return admin stub so app can use inventory API.
  const user = stubUser('user@warehouse.local');
  return NextResponse.json(user);
}
