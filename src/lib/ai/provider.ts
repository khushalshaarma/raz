import type {
  AIProvider,
  AIProviderConfig,
  AIProviderResult,
  AIProviderType,
  AIGenerateOptions,
} from "./types";

export interface AISchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export function createProviderInterface(
  name: string,
  type: AIProviderType,
  config: AIProviderConfig,
  generateFn: <T>(
    prompt: string,
    schema: unknown,
    options?: AIGenerateOptions
  ) => Promise<AIProviderResult<T>>,
  validateFn: <T>(output: unknown, schema: unknown) => boolean
): AIProvider {
  return {
    get name() {
      return name;
    },
    get type() {
      return type;
    },
    generateStructured: generateFn,
    validateOutput: validateFn,
  };
}

export function createProviderRegistry(): Map<AIProviderType, AIProvider> {
  return new Map();
}

export function registerProvider(
  registry: Map<AIProviderType, AIProvider>,
  provider: AIProvider
): void {
  if (registry.has(provider.type)) {
    throw new Error(`AI provider ${provider.type} already registered`);
  }
  registry.set(provider.type, provider);
}

export function getProvider(
  registry: Map<AIProviderType, AIProvider>,
  type: AIProviderType
): AIProvider | undefined {
  return registry.get(type);
}

export function getRequiredProvider(
  registry: Map<AIProviderType, AIProvider>,
  type: AIProviderType
): AIProvider {
  const provider = registry.get(type);
  if (!provider) {
    throw new Error(`AI provider ${type} not found in registry`);
  }
  return provider;
}
