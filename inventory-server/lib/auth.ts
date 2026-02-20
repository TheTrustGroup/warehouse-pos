/**
 * Verify request auth for API routes.
 * Accepts Bearer token and validates via Supabase Auth; returns user or ok: false.
 */

import { NextRequest } from 'next/server';
import { getSupabase } from './supabase';

export interface AuthResult {
  ok: true;
  user?: { id: string; email: string | null };
}

export interface AuthFailure {
  ok: false;
}

export type VerifyAuthResult = AuthResult | AuthFailure;

export async function verifyAuth(req: NextRequest): Promise<VerifyAuthResult> {
  const authHeader = req.headers.get('Authorization');
  const token =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return { ok: false };
  }

  try {
    const supabase = getSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { ok: false };
    }
    return {
      ok: true,
      user: { id: user.id, email: user.email ?? null },
    };
  } catch {
    return { ok: false };
  }
}
