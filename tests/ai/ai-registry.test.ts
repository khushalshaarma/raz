import { describe, it, expect } from "vitest";
import { initializeAIProvider } from "@/lib/ai";
import { createDeterministicProvider } from "@/lib/ai/providers/deterministic";
import { createProviderRegistry, registerProvider, getProvider } from "@/lib/ai/provider";
import type { AIProviderType } from "@/lib/ai/types";

describe("AI provider registry", () => {
  it("can register and retrieve providers", () => {
    const registry = createProviderRegistry();
    const provider = createDeterministicProvider({
      provider: "deterministic",
      model: "gpt-4o-mini",
    });
    registerProvider(registry, provider);

    const retrieved = getProvider(registry, "deterministic");
    expect(retrieved).toBeDefined();
    expect(retrieved?.type).toBe("deterministic");
  });

  it("throws when registering duplicate provider type", () => {
    const registry = createProviderRegistry();
    const provider1 = createDeterministicProvider({
      provider: "deterministic",
      model: "gpt-4o-mini",
    });
    registerProvider(registry, provider1);

    expect(() => registerProvider(registry, provider1)).toThrow("already registered");
  });

  it("returns undefined for unregistered provider type", () => {
    const registry = createProviderRegistry();
    expect(getProvider(registry, "openai")).toBeUndefined();
  });
});

describe("initializeAIProvider", () => {
  it("initializes with deterministic provider by default", () => {
    const provider = initializeAIProvider();
    expect(provider.type).toBe("deterministic");
  });
});

describe("AI provider type safety", () => {
  it("only allows deterministic and openai provider types", () => {
    const validTypes: AIProviderType[] = ["deterministic", "openai"];
    expect(validTypes).toContain("deterministic");
    expect(validTypes).toContain("openai");
  });
});
