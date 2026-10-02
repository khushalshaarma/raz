import type { AIProposal, AIRequest } from "./types";
import { validateAIProposal } from "./types";

export interface AIValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AIViolation {
  field: string;
  issue: string;
  severity: "ERROR" | "WARNING";
}

export function validateAIOutput(
  output: unknown
): AIValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (output === null || output === undefined) {
    return { valid: false, errors: ["AI output is null or undefined"], warnings: [] };
  }

  if (typeof output !== "object") {
    return { valid: false, errors: ["AI output is not an object"], warnings: [] };
  }

  const obj = output as Record<string, unknown>;

  if (!obj.intent || typeof obj.intent !== "string") {
    errors.push("Missing or invalid intent field");
  }
  if (!obj.action || typeof obj.action !== "string") {
    errors.push("Missing or invalid action field");
  }
  if (typeof obj.confidence !== "number") {
    errors.push("Confidence must be a number");
  } else if (obj.confidence < 0 || obj.confidence > 100) {
    errors.push("Confidence must be between 0 and 100");
  }
  if (typeof obj.requiresApproval !== "boolean") {
    errors.push("requiresApproval must be a boolean");
  }
  if (!obj.reasoningSummary || typeof obj.reasoningSummary !== "string") {
    errors.push("Missing or invalid reasoningSummary");
  }

  if (obj.entities && !Array.isArray(obj.entities)) {
    errors.push("entities must be an array");
  }

  if (obj.parameters && typeof obj.parameters !== "object") {
    errors.push("parameters must be an object");
  }

  if (warnings.length > 3) {
    warnings.push("Multiple validation issues detected in AI output");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAIProposalAgainstPolicy(
  proposal: AIProposal,
  policyConstraints: Record<string, unknown>
): AIValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const baseValidation = validateAIOutput(proposal);
  errors.push(...baseValidation.errors);

  if (proposal.confidence < (policyConstraints.minConfidence as number ?? 0)) {
    warnings.push("Proposal confidence below policy minimum");
  }

  if (proposal.requiresApproval && policyConstraints.autoApprove === false) {
    warnings.push("Proposal requires human approval per policy");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function ensureNoDirectExecution(proposal: AIProposal): AIValidationResult {
  const errors: string[] = [];
  const forbiddenActions = [
    "DIRECT_PAYMENT",
    "RAZORPAY_EXECUTE",
    "ISSUE_REFUND",
    "CREATE_ORDER",
    "MODIFY_POLICY",
    "DELETE_DATA",
  ];

  if (forbiddenActions.includes(proposal.action as string)) {
    errors.push(`AI proposal action ${proposal.action} cannot directly execute side effects`);
  }

  if (proposal.parameters?.directExecution === true) {
    errors.push("AI proposal cannot have directExecution flag set to true");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

export function sanitizeAIInput(input: AIRequest): AIRequest {
  const sanitized = { ...input };

  if (sanitized.query) {
    sanitized.query = sanitized.query.slice(0, 5000);
  }

  if (sanitized.context) {
    const blockedKeys = ["password", "token", "secret", "apikey", "authorization", "razorpay"];
    for (const key of Object.keys(sanitized.context)) {
      if (blockedKeys.some((bk) => key.toLowerCase().includes(bk))) {
        delete (sanitized.context as Record<string, unknown>)[key];
      }
    }
  }

  return sanitized;
}
