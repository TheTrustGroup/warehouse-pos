/**
 * Session auth: validate Bearer JWT via Supabase Auth or app session JWT, resolve role and warehouse scope.
 * - requireAuth / requireAdmin / requirePosRole: route guards
 * - getSession: for verifyAuth (Bearer or cookie)
 * - getRoleFromEmail, createSessionToken, setSessionCookie, clearSessionCookie: for login/logout
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { getSupabase } from '@/lib/supabase';
import { getScopeForUser } from '@/lib/data/userScopes';

export interface Session {
  email: string;
  role: string;
  /** Set from login binding / session JWT when present. */
  store_id?: string;
  device_id?: string;
  /** Single warehouse for POS cashier (from user_scopes); skip location selector. */
  warehouse_id?: string;
}

const ADMIN_EMAILS_KEY = 'ADMIN_EMAILS';
const SUPER_ADMIN_EMAILS_KEY = 'SUPER_ADMIN_EMAILS';

/** Emails that always get admin role at login (JWT). Set ADMIN_EMAILS or SUPER_ADMIN_EMAILS in env to override. */
const FALLBACK_ADMIN_EMAILS = new Set(['info@extremedeptkidz.com']);

function getAdminEmails(): Set<string> {
  const fromAdmin = process.env[ADMIN_EMAILS_KEY]?.trim();
  const fromSuper = process.env[SUPER_ADMIN_EMAILS_KEY]?.trim();
  const combined = [fromAdmin, fromSuper].filter(Boolean).join(',');
  if (!combined) return new Set(FALLBACK_ADMIN_EMAILS);
  return new Set(
    combined
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() || null : null;
}

function resolveRole(email: string, userMetadata?: Record<string, unknown>): string {
  const adminEmails = getAdminEmails();
  if (adminEmails.has(email.toLowerCase())) return 'admin';
  const metaRole = userMetadata?.role as string | undefined;
  if (typeof metaRole === 'string' && metaRole.trim()) {
    const r = metaRole.trim().toLowerCase();
    if (r === 'admin' || r === 'super_admin' || r === 'super admin' || r === 'superadmin') return 'admin';
    return r;
  }
  return 'cashier';
}

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionBinding {
  warehouse_id?: string;
  store_id?: string;
  device_id?: string;
}

/** Derive role from email (server-side). Used by login. */
export function getRoleFromEmail(email: string): string {
  return resolveRole(email);
}

/** Create a signed session JWT for login response. */
export async function createSessionToken(email: string, role: string, binding?: SessionBinding | undefined): Promise<string> {
  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET or JWT_SECRET (min 16 chars) required for login');
  const payload = { sub: email, email, role, ...binding, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(secret));
}

/** Set session cookie on login response. */
export async function setSessionCookie(
  response: NextResponse,
  _email: string,
  _role: string,
  _binding?: SessionBinding | undefined
): Promise<void> {
  const token = await createSessionToken(_email, _role, _binding);
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Secure`
  );
}

/** Clear session cookie on logout. */
export function clearSessionCookie(response: NextResponse): void {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

/** Alias for requirePosRole (warehouse/POS access). */
export const requireWarehouseOrPosRole = requirePosRole;

/**
 * Validate Bearer or session cookie: try Supabase JWT first, then app session JWT.
 * Login returns app session JWT (createSessionToken); requireAuth must accept it.
 */
async function requireAuthAsync(req: NextRequest): Promise<Session | NextResponse> {
  const token =
    getBearerToken(req) ?? req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization' }, { status: 401 });
  }
  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user?.email) {
      const role = resolveRole(user.email, user.user_metadata as Record<string, unknown> | undefined);
      return { email: user.email, role };
    }
  } catch {
    /* fall through to app session JWT */
  }
  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Invalid token' }, { status: 401 });
  }
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      clockTolerance: 60,
    });
    const email = (payload.email ?? payload.sub) as string;
    const role = (payload.role as string) ?? 'cashier';
    if (typeof email !== 'string' || !email) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Invalid token' }, { status: 401 });
    }
    return {
      email,
      role,
      store_id: typeof payload.store_id === 'string' ? payload.store_id : undefined,
      device_id: typeof payload.device_id === 'string' ? payload.device_id : undefined,
    };
  } catch {
    return NextResponse.json({ error: 'Unauthorized', message: 'Invalid token' }, { status: 401 });
  }
}

/**
 * Require authenticated user. Returns Session or NextResponse (401).
 * Use in API routes: const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;
 */
export async function requireAuth(request: NextRequest): Promise<Session | NextResponse> {
  return requireAuthAsync(request);
}

/** Normalize role for comparison: lowercase, spaces and hyphens → underscore. */
function normalizeRole(role: string): string {
  return (role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Roles that can perform admin-only actions. Any variant of admin/super_admin (case-insensitive, spaces/hyphens normalized). */
function isAdminRole(roleNorm: string): boolean {
  if (roleNorm === 'admin' || roleNorm === 'administrator') return true;
  if (roleNorm === 'superadmin' || roleNorm === 'super_admin') return true;
  if (roleNorm.startsWith('super') && roleNorm.includes('admin')) return true;
  return false;
}

/**
 * Require admin role. Returns Session or NextResponse (401/403).
 * Treats admin, super admin, superadmin, super_admin, administrator (and variants) as admin.
 */
export async function requireAdmin(request: NextRequest): Promise<Session | NextResponse> {
  const auth = await requireAuthAsync(request);
  if (auth instanceof NextResponse) return auth;
  const roleNorm = normalizeRole(auth.role ?? '');
  if (!isAdminRole(roleNorm)) {
    return NextResponse.json({ error: 'Forbidden', message: 'Admin required' }, { status: 403 });
  }
  return auth;
}

/**
 * Require POS role (admin or cashier) — can record sales.
 */
export async function requirePosRole(request: NextRequest): Promise<Session | NextResponse> {
  const auth = await requireAuthAsync(request);
  if (auth instanceof NextResponse) return auth;
  const allowed = ['admin', 'cashier'];
  if (!allowed.includes(auth.role.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden', message: 'POS access required' }, { status: 403 });
  }
  return auth;
}

export interface GetEffectiveWarehouseIdOpts {
  path?: string;
  method?: string;
}

/**
 * Resolve effective warehouse ID: body value if in user scope, else first allowed warehouse.
 * Admin with no scope: body warehouse is accepted as-is. Returns null if user has no scope and no body (or body not allowed).
 */
export async function getEffectiveWarehouseId(
  auth: Session,
  bodyWarehouseId: string | undefined,
  _opts?: GetEffectiveWarehouseIdOpts
): Promise<string | null> {
  const scope = await getScopeForUser(auth.email);
  const allowed = scope.allowedWarehouseIds;
  const trimmed = bodyWarehouseId?.trim();
  const isAdminOrSuperAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');
  if (allowed.length === 0) {
    if (isAdminOrSuperAdmin && trimmed) return trimmed;
    return null;
  }
  if (trimmed && allowed.includes(trimmed)) return trimmed;
  return allowed[0] ?? null;
}

/**
 * Sync version for callers that already have scope. Use when you already called getScopeForUser.
 */
export function getEffectiveWarehouseIdSync(
  allowedWarehouseIds: string[],
  bodyWarehouseId: string | undefined
): string | null {
  if (allowedWarehouseIds.length === 0) return null;
  const trimmed = bodyWarehouseId?.trim();
  if (trimmed && allowedWarehouseIds.includes(trimmed)) return trimmed;
  return allowedWarehouseIds[0] ?? null;
}

/** JSON payload for frontend (e.g. GET /api/auth/user). */
export function sessionUserToJson(auth: Session): { email: string; role: string; warehouse_id?: string } {
  const out: { email: string; role: string; warehouse_id?: string } = { email: auth.email, role: auth.role };
  if (auth.warehouse_id) out.warehouse_id = auth.warehouse_id;
  return out;
}

/**
 * Get session from request (Bearer or session cookie). Tries Supabase JWT then app session JWT.
 */
export async function getSession(req: NextRequest): Promise<Session | null> {
  const token =
    getBearerToken(req) ?? req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!token) return null;
  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user?.email) {
      return { email: user.email, role: resolveRole(user.email, user.user_metadata as Record<string, unknown> | undefined) };
    }
  } catch {
    /* try app JWT */
  }
  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      clockTolerance: 60,
    });
    const email = (payload.email ?? payload.sub) as string;
    const role = (payload.role as string) ?? 'cashier';
    if (typeof email !== 'string' || !email) return null;
    return {
      email,
      role,
      store_id: typeof payload.store_id === 'string' ? payload.store_id : undefined,
      device_id: typeof payload.device_id === 'string' ? payload.device_id : undefined,
      warehouse_id: typeof payload.warehouse_id === 'string' ? payload.warehouse_id : undefined,
    };
  } catch {
    return null;
  }
}
