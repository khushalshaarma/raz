import { getEnv } from "@/lib/config/env";
import type { AIProviderConfig, AIProviderType } from "./types";

export const AI_PROVIDER_ENV_VAR = "AI_PROVIDER";
export const OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY";
export const OPENAI_MODEL_ENV_VAR = "OPENAI_MODEL";
export const OPENAI_ORG_ID_ENV_VAR = "OPENAI_ORG_ID";
export const AI_TEMPERATURE_ENV_VAR = "AI_TEMPERATURE";
export const AI_MAX_TOKENS_ENV_VAR = "AI_MAX_TOKENS";

export const DEFAULT_AI_MODEL = "gpt-4o-mini";
export const DEFAULT_AI_TEMPERATURE = 0.7;
export const DEFAULT_AI_MAX_TOKENS = 2048;

export interface AIProviderFactoryResult {
  config: AIProviderConfig;
  type: AIProviderType;
}

export function getAIProviderConfig(): AIProviderFactoryResult {
  const type = (process.env[AI_PROVIDER_ENV_VAR] || "deterministic") as AIProviderType;

  if (!["deterministic", "openai"].includes(type)) {
    const config: AIProviderConfig = {
      provider: "deterministic",
      model: DEFAULT_AI_MODEL,
    };
    return { config, type: "deterministic" };
  }

  const config: AIProviderConfig = {
    provider: type,
    model: process.env[OPENAI_MODEL_ENV_VAR] || DEFAULT_AI_MODEL,
    temperature: parseFloat(process.env[AI_TEMPERATURE_ENV_VAR] || String(DEFAULT_AI_TEMPERATURE)),
    maxTokens: parseInt(process.env[AI_MAX_TOKENS_ENV_VAR] || String(DEFAULT_AI_MAX_TOKENS)),
    apiKey: process.env[OPENAI_API_KEY_ENV_VAR],
    organizationId: process.env[OPENAI_ORG_ID_ENV_VAR],
  };

  return { config, type };
}

export function isLLMAvailable(): boolean {
  const result = getAIProviderConfig();
  if (result.type === "deterministic") return false;
  if (!result.config.apiKey) return false;
  return true;
}

export function getEffectiveAIProvider(): AIProviderType {
  if (!isLLMAvailable()) return "deterministic";
  return getAIProviderConfig().type;
}

export function requireAIProvider(): AIProviderConfig {
  const result = getAIProviderConfig();

  if (result.type === "openai" && !result.config.apiKey) {
    throw new Error(
      "AI_PROVIDER is set to 'openai' but OPENAI_API_KEY is not configured. " +
      "Set AI_PROVIDER=deterministic or provide OPENAI_API_KEY."
    );
  }

  return result.config;
}
