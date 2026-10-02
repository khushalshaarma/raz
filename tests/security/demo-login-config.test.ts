import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isDemoLoginEnabled,
  getDemoLoginAvailability,
  getDemoMerchantCredentials,
} from "@/lib/config/demo";
import { validateProductionConfig } from "@/lib/config/startup";

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    vi.stubEnv(k, v === undefined ? "" : v);
  }
}

describe("demo login configuration guard", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_LOGIN_ENABLED", "");
    vi.stubEnv("DEMO_MERCHANT_PASSWORD", "");
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
    vi.stubEnv("JWT_SECRET", "growthos-dev-secret-change-in-production-2026");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled unless the flag is exactly 'true'", () => {
    for (const v of ["", "false", "1", "on", "enabled", "TRUE-ish"]) {
      vi.stubEnv("DEMO_LOGIN_ENABLED", v);
      expect(isDemoLoginEnabled()).toBe(false);
    }
    vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
    expect(isDemoLoginEnabled()).toBe(true);
  });

  it('treats "true" case-insensitively and trims whitespace', () => {
    vi.stubEnv("DEMO_LOGIN_ENABLED", "  TRUE  ");
    expect(isDemoLoginEnabled()).toBe(true);
  });

  it("is hard-disabled in production regardless of the flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
    expect(isDemoLoginEnabled()).toBe(false);
    expect(getDemoLoginAvailability().reason).toBe("DISABLED_IN_PRODUCTION");
  });

  it("reports the disabled reason when not opted in", () => {
    expect(getDemoLoginAvailability()).toEqual({ enabled: false, reason: "DISABLED_BY_CONFIG" });
  });

  it("returns null credentials when no demo password is configured (fails closed)", () => {
    expect(getDemoMerchantCredentials()).toBeNull();
    vi.stubEnv("DEMO_MERCHANT_PASSWORD", "   ");
    expect(getDemoMerchantCredentials()).toBeNull();
  });

  it("defaults the demo email to the seeded merchant when only a password is set", () => {
    vi.stubEnv("DEMO_MERCHANT_PASSWORD", "secret");
    vi.stubEnv("DEMO_MERCHANT_EMAIL", "");
    expect(getDemoMerchantCredentials()).toEqual({
      email: "arjun@urbanwear.in",
      password: "secret",
    });
  });

  it("never exposes the demo password as a NEXT_PUBLIC_ variable", () => {
    // The client bundle only inlines NEXT_PUBLIC_* values, so the password must
    // not be declared with that prefix anywhere in the environment.
    expect(process.env.NEXT_PUBLIC_DEMO_MERCHANT_PASSWORD).toBeUndefined();
    expect(process.env.NEXT_PUBLIC_DEMO_PASSWORD).toBeUndefined();
  });
});

describe("production startup validation", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "a-strong-production-secret-value-32chars");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db:5432/growthos");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://growthos.example.com");
    vi.stubEnv("RAZORPAY_MODE", "test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("flags DEMO_LOGIN_ENABLED=true as a production misconfiguration", () => {
    vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
    const check = validateProductionConfig().find((c) => c.name === "demo-login-disabled");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.message).toMatch(/PRODUCTION/);
  });

  it("passes the demo check when the flag is absent", () => {
    vi.stubEnv("DEMO_LOGIN_ENABLED", "");
    const check = validateProductionConfig().find((c) => c.name === "demo-login-disabled");
    expect(check!.passed).toBe(true);
  });

  it("does not add the check outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
    const names = validateProductionConfig().map((c) => c.name);
    expect(names).not.toContain("demo-login-disabled");
  });
});