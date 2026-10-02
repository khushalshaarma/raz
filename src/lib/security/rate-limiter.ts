interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
};

/**
 * Production API budgets. These are the values that actually protect the app.
 */
const PROD_DEFAULT_API_LIMIT: RateLimitConfig = { windowMs: 60000, maxRequests: 100 };

const PROD_API_ROUTE_LIMITS: Array<[string, RateLimitConfig]> = [
  ["/api/auth/login", { windowMs: 60000, maxRequests: 10 }],
  ["/api/auth/register", { windowMs: 300000, maxRequests: 5 }],
  ["/api/webhooks", { windowMs: 60000, maxRequests: 200 }],
];

/**
 * Development multiplies the request budget instead of disabling the limiter.
 *
 * React StrictMode double-invokes effects, Turbopack HMR remounts components and
 * the dev overlay issues extra requests, so a production-sized budget is
 * exhausted within seconds of active development and every API call starts
 * returning a spurious 429. Production limits are left untouched.
 */
const DEV_MAX_REQUESTS_MULTIPLIER = 100;

/** Resolve the budget for an API path, honouring the current environment. */
export function resolveApiRateLimit(
  pathname: string,
  nodeEnv: string | undefined = process.env.NODE_ENV
): RateLimitConfig {
  const matched = PROD_API_ROUTE_LIMITS.find(([prefix]) => pathname.startsWith(prefix));
  const base = matched ? matched[1] : PROD_DEFAULT_API_LIMIT;

  if (nodeEnv === "production") return { ...base };

  return {
    windowMs: base.windowMs,
    maxRequests: base.maxRequests * DEV_MAX_REQUESTS_MULTIPLIER,
  };
}

const buckets = new Map<string, RateLimitEntry>();

let lastSweepAt = 0;

function sweepExpiredEntries(now: number): void {
  // Cheap, throttled sweep so the map cannot grow without bound when keys are
  // never requested again. Only expired entries are removed, so live buckets
  // keep their counters.
  if (now - lastSweepAt < DEFAULT_CONFIG.windowMs) return;
  lastSweepAt = now;
  buckets.forEach((entry, key) => {
    if (now > entry.resetAt) buckets.delete(key);
  });
}

function getBucket(key: string, config: RateLimitConfig): RateLimitEntry {
  const now = Date.now();
  sweepExpiredEntries(now);
  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + config.windowMs };
    buckets.set(key, newEntry);
    return newEntry;
  }

  entry.count++;
  return entry;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  config?: Partial<RateLimitConfig>
): RateLimitResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const entry = getBucket(key, fullConfig);

  return {
    allowed: entry.count <= fullConfig.maxRequests,
    remaining: Math.max(0, fullConfig.maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

/** Seconds a blocked client should wait before retrying (RFC 6585). */
export function getRetryAfterSeconds(result: RateLimitResult, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((result.resetAt - now) / 1000));
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    "Retry-After": String(getRetryAfterSeconds(result)),
  };
}

export function clearRateLimitBuckets(): void {
  buckets.clear();
  lastSweepAt = 0;
}

export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let cleaned = 0;
  buckets.forEach((entry, key) => {
    if (now > entry.resetAt) {
      buckets.delete(key);
      cleaned++;
    }
  });
  return cleaned;
}
