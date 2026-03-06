/**
 * GET /api/health/ready — readiness: DB (and optional Redis) check. P3#23.
 * No auth. Returns 200 when healthy, 503 when not.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

async function checkDb(): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('sales').select('id').limit(1).maybeSingle();
    return !error;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // not configured
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url, token });
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()]);
  const healthy = dbOk && (redisOk === null || redisOk === true);
  const body = {
    status: healthy ? 'ok' : 'unhealthy',
    db: dbOk,
    ...(redisOk !== null && { redis: redisOk }),
  };
  return withCors(
    NextResponse.json(body, { status: healthy ? 200 : 503 }),
    request
  );
}
