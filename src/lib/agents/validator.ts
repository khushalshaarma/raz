import type { AgentOutput, AgentProposalData, ValidationResult } from "./types";

const REQUIRED_FIELDS = ["agentType", "agentRunId", "status", "confidence", "reasoningSummary"] as const;

const VALID_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "TIMEOUT", "BLOCKED"] as const;

export function validateAgentOutput(output: Partial<AgentOutput>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (output[field] === undefined || output[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (output.status && !(VALID_STATUSES as readonly string[]).includes(output.status)) {
    errors.push(`Invalid status: ${output.status}`);
  }

  if (output.confidence !== undefined) {
    if (output.confidence < 0 || output.confidence > 100) {
      errors.push(`Confidence must be 0-100, got ${output.confidence}`);
    }
  }

  if (output.proposals) {
    for (const proposal of output.proposals) {
      const proposalErrors = validateProposal(proposal);
      errors.push(...proposalErrors);
    }
  }

  if (output.warnings && output.warnings.length > 5) {
    warnings.push("More than 5 warnings — consider simplifying output");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateProposal(proposal: AgentProposalData): string[] {
  const errors: string[] = [];

  if (!proposal.title || proposal.title.length === 0) {
    errors.push("Proposal missing title");
  }
  if (!proposal.description || proposal.description.length === 0) {
    errors.push("Proposal missing description");
  }
  if (proposal.confidence < 0 || proposal.confidence > 100) {
    errors.push(`Proposal confidence must be 0-100, got ${proposal.confidence}`);
  }
  if (!proposal.riskLevel || !["LOW", "MEDIUM", "HIGH"].includes(proposal.riskLevel)) {
    errors.push(`Proposal riskLevel must be LOW/MEDIUM/HIGH, got ${proposal.riskLevel}`);
  }
  if (proposal.financialImpact) {
    if (proposal.financialImpact.amountMinor < 0) {
      errors.push("Proposal financial impact amountMinor must be non-negative");
    }
  }

  return errors;
}

export function validateFinancialAmount(amountMinor: number): boolean {
  return Number.isInteger(amountMinor) && amountMinor >= 0;
}

export function validateMerchantOwnership(
  outputMerchantId: string,
  contextMerchantId: string
): boolean {
  return outputMerchantId === contextMerchantId;
}

export function sanitizeAgentInput(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const blockedKeys = ["password", "token", "secret", "apikey", "authorization"];

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (blockedKeys.some((bk) => lowerKey.includes(bk))) {
      continue;
    }
    if (typeof value === "string" && containsPromptInjection(value)) {
      sanitized[key] = "[SANITIZED]";
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

export function containsPromptInjection(text: string): boolean {
  const patterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+all\s+prior/i,
    /disregard\s+(all\s+)?instructions/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /new\s+instructions?\s*:/i,
    /system\s*prompt\s*override/i,
    /forget\s+everything/i,
    /override\s+governance/i,
    /bypass\s+(all\s+)?security/i,
    /issue\s+refund\s+₹/i,
    /refund\s+₹\d+/i,
  ];

  return patterns.some((p) => p.test(text));
}
