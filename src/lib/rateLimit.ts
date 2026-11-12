// In-memory sliding window rate limiter
// Protects backend API endpoints and Supabase database from being spammed

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface GlobalRateLimitStore {
  __oz_rate_limits?: Map<string, RateLimitRecord>;
  __oz_rate_limiter_cleaner_started?: boolean;
}

const g = globalThis as unknown as GlobalRateLimitStore;

if (!g.__oz_rate_limits) {
  g.__oz_rate_limits = new Map();
}

// Periodic cleanup of expired rate limit keys every 30 seconds
if (!g.__oz_rate_limiter_cleaner_started) {
  g.__oz_rate_limiter_cleaner_started = true;
  setInterval(() => {
    const now = Date.now();
    const limits = g.__oz_rate_limits;
    if (limits) {
      for (const [key, record] of limits.entries()) {
        if (record.resetAt <= now) {
          limits.delete(key);
        }
      }
    }
  }, 30000);
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const limits = g.__oz_rate_limits!;
  const record = limits.get(key);

  if (!record || record.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      resetInMs: windowMs,
    };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: Math.max(0, record.resetAt - now),
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - record.count),
    resetInMs: Math.max(0, record.resetAt - now),
  };
}

export function getClientIdentifier(request: Request, prefix: string = ''): string {
  const forwarded = request.headers.get('x-forwarded-for');
  let ip = '127.0.0.1';
  if (forwarded) {
    ip = forwarded.split(',')[0].trim();
  } else {
    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
      ip = realIp.trim();
    } else {
      const cfIp = request.headers.get('cf-connecting-ip');
      if (cfIp) ip = cfIp.trim();
    }
  }

  // If client provides an auth token, bind rate limit to that token identity as well
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim().slice(0, 24);

  return `${prefix}:${ip}${token ? `:${token}` : ''}`;
}

export const rateLimitProfiles = {
  // Creating customer or counter orders: 15 per minute
  ordersCreate: { maxRequests: 15, windowMs: 60_000 },
  // High-frequency live status / active order polling: 120 per 10 seconds
  ordersPolling: { maxRequests: 120, windowMs: 10_000 },
  // History queries: 30 per 10 seconds
  historyQueries: { maxRequests: 30, windowMs: 10_000 },
  // Menu fetches: 80 per 10 seconds
  menuPolling: { maxRequests: 80, windowMs: 10_000 },
  // Settings fetches: 40 per 10 seconds
  settingsPolling: { maxRequests: 40, windowMs: 10_000 },
  // Manual button refreshes: 6 per 5 seconds
  manualRefresh: { maxRequests: 6, windowMs: 5_000 },
};

