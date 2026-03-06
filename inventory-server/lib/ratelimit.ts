/**
 * Rate limiting for auth and mutations. Uses Upstash Redis when env is set; otherwise no-op.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let loginLimiter: Ratelimit | null = null;

function getLoginLimiter(): Ratelimit | null {
  if (loginLimiter !== null) return loginLimiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const redis = new Redis({ url, token });
    loginLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(10, '60 s'),
      prefix: 'rl:login',
    });
    return loginLimiter;
  } catch {
    return null;
  }
}

/** Return a stable identifier for the client (IP or fallback). */
export function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/**
 * Check login rate limit. Returns { limited: true } if over limit; otherwise { limited: false }.
 * When Redis is not configured, always returns { limited: false }.
 */
export async function checkLoginRateLimit(req: Request): Promise<{ limited: true; retryAfter?: number } | { limited: false }> {
  const limiter = getLoginLimiter();
  if (!limiter) return { limited: false };
  const id = getClientIdentifier(req);
  const result = await limiter.limit(id);
  if (result.success) return { limited: false };
  return { limited: true, retryAfter: result.reset - Math.floor(Date.now() / 1000) };
}
