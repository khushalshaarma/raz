import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

export interface StartupCheck {
  name: string;
  passed: boolean;
  message: string;
}

export function validateProductionConfig(): StartupCheck[] {
  const checks: StartupCheck[] = [];

  if (process.env.NODE_ENV !== "production") {
    checks.push({ name: "env-mode", passed: true, message: "Non-production mode, skipping strict validation" });
    return checks;
  }

  const env = getEnv();

  checks.push({
    name: "jwt-secret",
    passed: env.JWT_SECRET !== "growthos-dev-secret-change-in-production-2026" && env.JWT_SECRET.length >= 32,
    message: env.JWT_SECRET === "growthos-dev-secret-change-in-production-2026"
      ? "JWT_SECRET is using default value - CHANGE THIS"
      : env.JWT_SECRET.length < 32
        ? "JWT_SECRET too short (minimum 32 characters)"
        : "OK",
  });

  checks.push({
    name: "database-url",
    passed: env.DATABASE_URL !== "file:./dev.db",
    message: env.DATABASE_URL === "file:./dev.db"
      ? "DATABASE_URL is using SQLite dev file - use a real database"
      : "OK",
  });

  checks.push({
    name: "razorpay-mode",
    passed: env.RAZORPAY_MODE === "test",
    message: env.RAZORPAY_MODE === "live"
      ? "RAZORPAY_MODE is LIVE - ensure this is intentional"
      : "OK",
  });

  if (env.RAZORPAY_MODE === "live") {
    checks.push({
      name: "razorpay-keys",
      passed: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      message: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
        ? "OK"
        : "Razorpay keys not configured for LIVE mode",
    });
  }

  checks.push({
    name: "app-url",
    passed: env.NEXT_PUBLIC_APP_URL !== "http://localhost:3000",
    message: env.NEXT_PUBLIC_APP_URL === "http://localhost:3000"
      ? "NEXT_PUBLIC_APP_URL is localhost - update for production"
      : "OK",
  });

  return checks;
}

export function logStartupValidation(checks: StartupCheck[]): void {
  const failures = checks.filter((c) => !c.passed);

  if (failures.length === 0) {
    logger.info("Startup validation passed", { checks: checks.length });
    return;
  }

  logger.warn("Startup validation issues found", {
    total: checks.length,
    failures: failures.length,
    issues: failures.map((f) => `${f.name}: ${f.message}`),
  });
}

export function shouldBlockStartup(checks: StartupCheck[]): boolean {
  if (process.env.NODE_ENV !== "production") return false;

  const blockingFailures = checks.filter(
    (c) => !c.passed && (c.name === "jwt-secret" || c.name === "database-url")
  );

  return blockingFailures.length > 0;
}
