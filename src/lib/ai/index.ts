import { createDeterministicProvider } from "./providers/deterministic";
import { createOpenAIProvider } from "./providers/openai";
import { createProviderRegistry, getProvider, registerProvider, getRequiredProvider } from "./provider";
import { getAIProviderConfig, getEffectiveAIProvider, isLLMAvailable, requireAIProvider } from "./config";
import type { AIProvider, AIProviderType } from "./types";

export * from "./types";
export * from "./config";
export * from "./provider";
export * from "./validator";
export { createDeterministicProvider, validateStructuredAIOutput, validateAISchemaCompliance, sanitizePrompt } from "./providers/deterministic";
export { createOpenAIProvider, validateStructuredAIOutput as validateStructuredAIOutputOpenAI, resetOpenAIClient } from "./providers/openai";

function initializeAIProvider(): AIProvider {
  const { type, config } = getAIProviderConfig();
  const registry = createProviderRegistry();

  registerProvider(registry, createDeterministicProvider(config));

  if (type === "openai" && config.apiKey) {
    try {
      registerProvider(registry, createOpenAIProvider(config));
    } catch {
      // Fallback to deterministic if OpenAI fails to initialize
    }
  }

  return getRequiredProvider(registry, type);
}

export {
  initializeAIProvider,
  createProviderRegistry,
  registerProvider,
  getProvider,
  getRequiredProvider,
  getAIProviderConfig,
  getEffectiveAIProvider,
  isLLMAvailable,
  requireAIProvider,
};
