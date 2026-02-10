/**
 * Server-side session: role is derived from trusted server data only (email → role at login).
 * Never trust role from request body or client. 403 + log on unauthorized access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRoleFromEmail, isAdmin, canAccessPos, canWarehouseDeductOrReturn, type BackendRole } from './roles';

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
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- Node crypto for HMAC (no ES import in Node)
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export interface Session {
  email: string;
  role: BackendRole;
  exp: number;
  /** Optional. When present, POS/inventory mutations are scoped to this warehouse (server overrides body). */
  warehouse_id?: string;
  /** Optional. Future: store context. */
  store_id?: string | null;
  /** Optional. Future: device/POS terminal id. */
  device_id?: string;
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

/** Options for session binding (optional; backward compatible). */
export interface CreateSessionOptions {
  warehouse_id?: string;
  store_id?: string | null;
  device_id?: string;
}

/** Same signed token string used for cookie; return in login response so frontend can send Authorization: Bearer and survive refresh when cookies are blocked (cross-origin). */
export function createSessionToken(
  email: string,
  role: BackendRole,
  options?: CreateSessionOptions
): string {
  const payload: Record<string, unknown> = {
    email: email.trim().toLowerCase(),
    role,
  };
  if (options?.warehouse_id != null && String(options.warehouse_id).trim())
    payload.warehouse_id = options.warehouse_id.trim();
  if (options?.store_id !== undefined) payload.store_id = options.store_id;
  if (options?.device_id != null && String(options.device_id).trim())
    payload.device_id = options.device_id.trim();
  return setCookiePayload(payload);
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
    const session: Session = {
      email: decoded.email,
      role: decoded.role as BackendRole,
      exp: decoded.exp,
    };
    if (decoded.warehouse_id != null && String(decoded.warehouse_id).trim())
      session.warehouse_id = String(decoded.warehouse_id).trim();
    if (decoded.store_id !== undefined) session.store_id = decoded.store_id;
    if (decoded.device_id != null && String(decoded.device_id).trim())
      session.device_id = String(decoded.device_id).trim();
    return session;
  } catch {
    return null;
  }
}

export function setSessionCookie(
  response: NextResponse,
  email: string,
  role: BackendRole,
  options?: CreateSessionOptions
): void {
  const payload: Record<string, unknown> = { email: email.trim().toLowerCase(), role };
  if (options?.warehouse_id != null && String(options.warehouse_id).trim())
    payload.warehouse_id = options.warehouse_id.trim();
  if (options?.store_id !== undefined) payload.store_id = options.store_id;
  if (options?.device_id != null && String(options.device_id).trim())
    payload.device_id = options.device_id.trim();
  const value = setCookiePayload(payload);
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

/** Returns 401/403 if not allowed to deduct/return stock (POS roles + warehouse role). Admins retain full access. */
export function requireWarehouseOrPosRole(request: NextRequest): Session | NextResponse {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canWarehouseDeductOrReturn(session.role)) {
    console.warn('[RBAC] Unauthorized orders deduct/return attempt', {
      path: request.nextUrl.pathname,
      method: request.method,
      email: session.email,
      role: session.role,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return session;
}

/**
 * Effective warehouse for inventory mutations. When session has warehouse_id, use it and override body.
 * Log (only) when body differs from session — observe first; do not block.
 */
export function getEffectiveWarehouseId(
  session: Session,
  bodyWarehouseId: string | undefined,
  context: { path: string; method: string }
): string | null {
  const sessionWarehouse = session.warehouse_id?.trim();
  const bodyWarehouse = bodyWarehouseId?.trim();

  if (sessionWarehouse) {
    if (bodyWarehouse && bodyWarehouse !== sessionWarehouse) {
      console.warn('[SessionWarehouse] body.warehouse_id differs from session.warehouse_id (overriding)', {
        ...context,
        session_warehouse_id: sessionWarehouse,
        body_warehouse_id: bodyWarehouse,
        email: session.email,
      });
    }
    return sessionWarehouse;
  }
  return bodyWarehouse || null;
}

export function sessionUserToJson(session: Session): Record<string, unknown> {
  const now = new Date().toISOString();
  const out: Record<string, unknown> = {
    id: 'api-session-user',
    username: session.email.split('@')[0] || 'user',
    email: session.email,
    role: session.role,
    fullName: session.email,
    isActive: true,
    lastLogin: now,
    createdAt: now,
  };
  if (session.warehouse_id) out.warehouse_id = session.warehouse_id;
  if (session.store_id !== undefined) out.store_id = session.store_id;
  if (session.device_id) out.device_id = session.device_id;
  return out;
}

export { getRoleFromEmail };
