import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  NEXT_PUBLIC_APP_NAME: z.string().default("GrowthOS"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  RAZORPAY_MODE: z.enum(["test", "live"]).default("test"),
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),

  AI_PROVIDER: z.enum(["deterministic", "openai"]).default("deterministic"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_ORG_ID: z.string().optional().default(""),
  AI_TEMPERATURE: z.coerce.number().default(0.7),
  AI_MAX_TOKENS: z.coerce.number().default(2048),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  AGENT_TIMEOUT_MS: z.coerce.number().default(30000),
  MAX_RETRY_ATTEMPTS: z.coerce.number().default(3),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variables:\n${errors.join("\n")}`);
    }
    console.warn("Environment validation warnings:\n" + errors.join("\n"));
    _env = envSchema.parse({
      ...process.env,
      JWT_SECRET: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production-2026",
      DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
    });
  } else {
    _env = parsed.data;
  }
  return _env;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

export function isTest(): boolean {
  return getEnv().NODE_ENV === "test";
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === "development";
}

export function isLivePayments(): boolean {
  return getEnv().RAZORPAY_MODE === "live";
}
