export type CorrelationIdComponents = {
  requestId?: string;
  growthCycleId?: string;
  agentRunId?: string;
  decisionId?: string;
  governanceDecisionId?: string;
  executionId?: string;
  paymentId?: string;
  merchantId?: string;
};

export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildCorrelationId(components: CorrelationIdComponents): string {
  const parts: string[] = [];
  if (components.requestId) parts.push(`req:${components.requestId}`);
  if (components.growthCycleId) parts.push(`gc:${components.growthCycleId}`);
  if (components.agentRunId) parts.push(`ar:${components.agentRunId}`);
  if (components.decisionId) parts.push(`dec:${components.decisionId}`);
  if (components.governanceDecisionId) parts.push(`gov:${components.governanceDecisionId}`);
  if (components.executionId) parts.push(`exec:${components.executionId}`);
  if (components.paymentId) parts.push(`pay:${components.paymentId}`);
  if (components.merchantId) parts.push(`m:${components.merchantId}`);
  return parts.join("|");
}

export function parseCorrelationId(correlationId: string): CorrelationIdComponents {
  const components: CorrelationIdComponents = {};
  const parts = correlationId.split("|");
  for (const part of parts) {
    const [prefix, value] = part.split(":");
    switch (prefix) {
      case "req": components.requestId = value; break;
      case "gc": components.growthCycleId = value; break;
      case "ar": components.agentRunId = value; break;
      case "dec": components.decisionId = value; break;
      case "gov": components.governanceDecisionId = value; break;
      case "exec": components.executionId = value; break;
      case "pay": components.paymentId = value; break;
      case "m": components.merchantId = value; break;
    }
  }
  return components;
}

export function correlationHeaders(correlationId: string): Record<string, string> {
  return { "x-correlation-id": correlationId };
}