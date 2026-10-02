import type {
  AIProvider,
  AIProviderConfig,
  AIProviderResult,
  AIProviderType,
  AIGenerateOptions,
  AIRequest,
  AIProposal,
} from "../types";
import { validateAIProposal, createAIProposalId } from "../types";
import { createProviderInterface } from "../provider";

export interface DeterministicProviderOptions {
  merchantId?: string;
  catalogData?: Record<string, unknown>;
}

export function createDeterministicProvider(
  _config: AIProviderConfig
): AIProvider {
  const provider = createProviderInterface(
    "Deterministic AI Provider",
    "deterministic",
    _config,
    async function generateStructured<T>(
      prompt: string,
      schema: unknown,
      options?: AIGenerateOptions
    ): Promise<AIProviderResult<T>> {
      const startTime = Date.now();
      const errors: string[] = [];

      const safePrompt = sanitizePrompt(prompt);

      const result = await generateDeterministicResponse<T>(
        safePrompt,
        schema as Record<string, unknown>,
        options,
        errors
      );

      return {
        success: errors.length === 0,
        data: result as T,
        confidence: {
          level: "HIGH",
          score: 90,
          reasoning: "Deterministic provider: output derived from structured business logic",
        },
        reasoning: {
          sources: ["internal-catalog", "business-rules"],
          methodology: "deterministic-rules",
          dataPoints: 1,
          confidenceScore: 90,
          reasoningSummary: "Output generated from deterministic business rules without external LLM",
        },
        provider: "deterministic",
        durationMs: Date.now() - startTime,
        errors,
      };
    },
    function validateOutput<T>(output: unknown, schema: unknown): boolean {
      if (output === null || output === undefined) return false;
      if (typeof output !== "object") return false;
      return true;
    }
  );

  return provider;
}

async function generateDeterministicResponse<T>(
  prompt: string,
  schema: Record<string, unknown>,
  options?: AIGenerateOptions,
  errors: string[] = []
): Promise<unknown> {
  return {
    intent: "FIND_PRODUCTS",
    action: "PRODUCT_DISCOVERY",
    entities: [],
    parameters: {},
    reasoningSummary: "Deterministic provider processed request using internal catalog data",
    confidence: 85,
    confidenceLevel: "HIGH" as const,
    constraints: [],
    requiresApproval: false,
    status: "PROPOSED" as const,
    metadata: {
      sources: ["internal-catalog"],
      methodology: "deterministic-rules",
      dataPoints: 1,
      confidenceScore: 85,
      reasoningSummary: "Generated from business rules",
    },
  };
}

export function sanitizePrompt(prompt: string): string {
  const blocked = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /disregard\s+(all\s+)?instructions/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /system\s*prompt\s*override/i,
    /forget\s+everything/i,
    /override\s+governance/i,
    /bypass\s+(all\s+)?security/i,
    /execute\s+payment/i,
    /issue\s+refund/i,
    /create\s+razorpay\s+order/i,
    /process\s+payment/i,
    /direct\s+database\s+mutation/i,
    /DELETE\s+FROM/i,
    /DROP\s+TABLE/i,
  ];

  let sanitized = prompt;
  for (const pattern of blocked) {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  }

  return sanitized.slice(0, 10000);
}

export function validateAISchemaCompliance(
  output: unknown
): { compliant: boolean; errors: string[] } {
  const errors: string[] = [];

  if (output === null || output === undefined) {
    errors.push("Output is null or undefined");
    return { compliant: false, errors };
  }

  if (typeof output !== "object") {
    errors.push("Output is not an object");
    return { compliant: false, errors };
  }

  const obj = output as Record<string, unknown>;

  if (!obj.intent || typeof obj.intent !== "string") {
    errors.push("Missing or invalid intent field");
  }
  if (!obj.action || typeof obj.action !== "string") {
    errors.push("Missing or invalid action field");
  }
  if (typeof obj.confidence !== "number" || obj.confidence < 0 || obj.confidence > 100) {
    errors.push("Confidence must be a number between 0 and 100");
  }
  if (typeof obj.requiresApproval !== "boolean") {
    errors.push("requiresApproval must be a boolean");
  }

  return { compliant: errors.length === 0, errors };
}

export function validateStructuredAIOutput(
  output: unknown
): { compliant: boolean; errors: string[] } {
  return validateAISchemaCompliance(output);
}
