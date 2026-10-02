import { getEnv } from "./env";

export interface FeatureFlags {
  AUTOPILOT_ENABLED: boolean;
  LLM_ENABLED: boolean;
  AI_PROVIDER: string;
  RAZORPAY_LIVE: boolean;
  AGENT_EXECUTION_ENABLED: boolean;
  RECONCILIATION_ENABLED: boolean;
  WEBHOOK_PROCESSING: boolean;
}

const FEATURE_OVERRIDES: Record<string, boolean | string | undefined> = {};

export function getFeatureFlags(): FeatureFlags {
  const env = getEnv();
  return {
    AUTOPILOT_ENABLED: process.env.FEATURE_AUTOPILOT === "true",
    LLM_ENABLED: process.env.FEATURE_LLM === "true",
    AI_PROVIDER: process.env.AI_PROVIDER || "deterministic",
    RAZORPAY_LIVE: env.RAZORPAY_MODE === "live",
    AGENT_EXECUTION_ENABLED: process.env.FEATURE_AGENTS !== "false",
    RECONCILIATION_ENABLED: process.env.FEATURE_RECONCILIATION !== "false",
    WEBHOOK_PROCESSING: process.env.FEATURE_WEBHOOKS !== "false",
    ...FEATURE_OVERRIDES,
  } as FeatureFlags;
}

export function setFeatureOverride(flag: keyof FeatureFlags, value: boolean | string): void {
  FEATURE_OVERRIDES[flag] = value;
}

export function resetFeatureOverrides(): void {
  for (const key of Object.keys(FEATURE_OVERRIDES)) {
    delete FEATURE_OVERRIDES[key];
  }
}
