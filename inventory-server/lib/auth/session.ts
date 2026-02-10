/**
 * Server-side session: role is derived from trusted server data only (email → role at login).
 * Never trust role from request body or client. 403 + log on unauthorized access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRoleFromEmail, isAdmin, canAccessPos, type BackendRole } from './roles';

const COOKIE_NAME = 'warehouse_session';
const MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days so refresh doesn't log out

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production (min 16 chars).');
    }
    return 'dev-secret-min-16-chars';
  }
  return s;
}

function sign(value: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- Node crypto for HMAC
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export interface Session {
  email: string;
  role: BackendRole;
  exp: number;
}

export function getSession(request: NextRequest): Session | null {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (bearer) {
    const session = parseTokenValue(bearer);
    if (session) return session;
  }
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return null;
  return parseTokenValue(cookie);
}

function setCookiePayload(payload: Record<string, unknown>): string {
  payload.exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

/** Same signed token string used for cookie; return in login response so frontend can send Authorization: Bearer and survive refresh when cookies are blocked (cross-origin). */
export function createSessionToken(email: string, role: BackendRole): string {
  return setCookiePayload({ email: email.trim().toLowerCase(), role });
}

function parseTokenValue(value: string): Session | null {
  const i = value.lastIndexOf('.');
  if (i === -1) return null;
  const payload = value.slice(0, i);
  const sig = value.slice(i + 1);
  if (sign(payload) !== sig) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.email || !decoded.role || !decoded.exp) return null;
    if (decoded.exp < Date.now() / 1000) return null;
    return {
      email: decoded.email,
      role: decoded.role as BackendRole,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(
  response: NextResponse,
  email: string,
  role: BackendRole
): void {
  const value = setCookiePayload({ email: email.trim().toLowerCase(), role });
  const isProduction = process.env.NODE_ENV === 'production';
  // Production: SameSite=None so the cookie is sent when frontend (e.g. warehouse.extremedeptkidz.com) calls API on another origin. Requires Secure.
  response.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: MAX_AGE_SEC,
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
}

/** Returns 401 response if not authenticated. */
export function requireAuth(request: NextRequest): Session | NextResponse {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

/** Returns 401/403 response if not admin. Logs unauthorized attempt. */
export function requireAdmin(request: NextRequest): Session | NextResponse {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.role)) {
    console.warn('[RBAC] Unauthorized admin attempt', {
      path: request.nextUrl.pathname,
      method: request.method,
      email: session.email,
      role: session.role,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return session;
}

/** Returns 401/403 if not allowed to use POS (sales, deduct, transactions). */
export function requirePosRole(request: NextRequest): Session | NextResponse {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canAccessPos(session.role)) {
    console.warn('[RBAC] Unauthorized POS attempt', {
      path: request.nextUrl.pathname,
      method: request.method,
      email: session.email,
      role: session.role,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return session;
}

export function sessionUserToJson(session: Session): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: 'api-session-user',
    username: session.email.split('@')[0] || 'user',
    email: session.email,
    role: session.role,
    fullName: session.email,
    isActive: true,
    lastLogin: now,
    createdAt: now,
  };
}

export { getRoleFromEmail };
