/**
 * Verify request auth for API routes.
 * 1. Tries session token (Bearer = login response token, signed with SESSION_SECRET).
 * 2. Tries Supabase Auth (Bearer = Supabase access_token).
 * 3. If both fail, tries JWT verify with SALES_JWT_SECRET (for custom JWTs).
 */

import { NextRequest } from 'next/server';
import { jwtVerify, type JWTPayload } from 'jose';
import { getSupabase } from './supabase';
import { getSession } from './auth/session';

export interface AuthResult {
  ok: true;
  user?: { id: string; email: string | null };
}

export interface AuthFailure {
  ok: false;
}

export type VerifyAuthResult = AuthResult | AuthFailure;

/** Verify Bearer token as JWT with SALES_JWT_SECRET; return user from payload (sub, email). */
async function verifyJwtFallback(token: string): Promise<VerifyAuthResult> {
  const secret = process.env.SALES_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return { ok: false };

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256', 'HS384', 'HS512'],
      clockTolerance: 60,
    });
    const p = payload as JWTPayload & { sub?: string; email?: string };
    const id = typeof p.sub === 'string' ? p.sub : 'jwt-user';
    const email = typeof p.email === 'string' ? p.email : null;
    return { ok: true, user: { id, email } };
  } catch {
    return { ok: false };
  }
}

export async function verifyAuth(req: NextRequest): Promise<VerifyAuthResult> {
  const authHeader = req.headers.get('Authorization');
  const token =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return { ok: false };
  }

  // 1) Session token (login returns base64url.HMAC signed with SESSION_SECRET — same as /api/auth/login)
  const session = getSession(req);
  if (session) {
    return {
      ok: true,
      user: { id: session.email, email: session.email },
    };
  }

  // 2) Supabase (e.g. when login returns Supabase session.access_token)
  try {
    const supabase = getSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (!error && user) {
      return {
        ok: true,
        user: { id: user.id, email: user.email ?? null },
      };
    }
  } catch {
    /* fall through to JWT */
  }

  // 3) App JWT (when login returns a standard JWT signed with SALES_JWT_SECRET / JWT_SECRET)
  return verifyJwtFallback(token);
}
