/**
 * Demo entry configuration (SERVER ONLY).
 *
 * This module backs the "click Merchant on the landing page and land straight
 * on the merchant dashboard" presentation shortcut. It grants a REAL,
 * FULLY AUTHENTICATED session: the demo request goes through the same password
 * verification and JWT signing as `/api/auth/login`, and the browser only ever
 * receives an httpOnly session cookie. Nothing here weakens authentication —
 * there is no bypass of `verifyPassword`, `signToken` or the route guards.
 *
 * Safety rules enforced here:
 *  1. Opt-in only. Disabled unless `DEMO_LOGIN_ENABLED=true` is explicitly set.
 *  2. Hard-disabled when `NODE_ENV=production`, regardless of the flag. A
 *     misconfigured production deploy must not hand out sessions.
 *  3. The demo password is read from the environment on the server. It is never
 *     sent to the browser and must never be declared with a `NEXT_PUBLIC_`
 *     prefix (that would inline it into the client bundle).
 *
 * `process.env` is read per call rather than through `getEnv()` so that the
 * enable flag stays observable at request time and testable via env stubbing.
 */

const DEFAULT_DEMO_MERCHANT_EMAIL = "arjun@urbanwear.in";

export type DemoLoginDisabledReason =
  | "DISABLED_BY_CONFIG"
  | "DISABLED_IN_PRODUCTION"
  | "NO_DEMO_CREDENTIALS";

export interface DemoLoginAvailability {
  enabled: boolean;
  reason?: DemoLoginDisabledReason;
}

function readFlag(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/**
 * Whether the local demo merchant shortcut may be used at all.
 *
 * Production is a hard deny, not a soft warning: `DEMO_LOGIN_ENABLED` alone can
 * never turn this on in a production deployment.
 */
export function getDemoLoginAvailability(): DemoLoginAvailability {
  if (process.env.NODE_ENV === "production") {
    return { enabled: false, reason: "DISABLED_IN_PRODUCTION" };
  }
  if (!readFlag(process.env.DEMO_LOGIN_ENABLED)) {
    return { enabled: false, reason: "DISABLED_BY_CONFIG" };
  }
  return { enabled: true };
}

export function isDemoLoginEnabled(): boolean {
  return getDemoLoginAvailability().enabled;
}

export interface DemoMerchantCredentials {
  email: string;
  password: string;
}

/**
 * The seeded demo merchant's credentials, resolved server-side.
 *
 * Returns `null` when the demo password is not configured, so the endpoint
 * fails closed instead of falling back to a hardcoded default. The email has a
 * safe default because it is not a secret; the password does not.
 */
export function getDemoMerchantCredentials(): DemoMerchantCredentials | null {
  const password = process.env.DEMO_MERCHANT_PASSWORD;
  if (!password || password.trim().length === 0) return null;

  const email = (process.env.DEMO_MERCHANT_EMAIL || DEFAULT_DEMO_MERCHANT_EMAIL).trim();
  return { email, password };
}