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
 *  2. Production requires a SECOND, deliberate key: `DEMO_LOGIN_ALLOW_PRODUCTION=true`.
 *     One flag can never silently open a public deployment; enabling demo access
 *     on a live URL is a conscious two-step decision.
 *  3. The demo password is read from the environment on the server. It is never
 *     sent to the browser and must never be declared with a `NEXT_PUBLIC_`
 *     prefix (that would inline it into the client bundle).
 *  4. The flow mints an ordinary MERCHANT session only. There is no admin path,
 *     and every downstream guard (middleware, merchant scoping) still applies.
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
 * Whether the demo merchant shortcut may be used at all.
 *
 * Production is a two-key gate rather than a hard deny. `DEMO_LOGIN_ENABLED=true`
 * alone is still inert in production: the deploy must additionally set
 * `DEMO_LOGIN_ALLOW_PRODUCTION=true`. That keeps the original safety property
 * (a stray or inherited flag cannot open a live deploy) while allowing a
 * deliberately configured production demo to work.
 */
export function getDemoLoginAvailability(): DemoLoginAvailability {
  if (!readFlag(process.env.DEMO_LOGIN_ENABLED)) {
    return { enabled: false, reason: "DISABLED_BY_CONFIG" };
  }
  if (process.env.NODE_ENV === "production" && !readFlag(process.env.DEMO_LOGIN_ALLOW_PRODUCTION)) {
    return { enabled: false, reason: "DISABLED_IN_PRODUCTION" };
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