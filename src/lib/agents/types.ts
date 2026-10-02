export type AgentType =
  | "OPPORTUNITY"
  | "STRATEGY"
  | "SIMULATION"
  | "DECISION"
  | "SECURITY"
  | "GOVERNANCE"
  | "EXECUTION"
  | "OBSERVATION"
  | "LEARNING";

export type AgentStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "TIMEOUT" | "BLOCKED";

export type MessageType = "PROPOSAL" | "REQUEST" | "RESPONSE" | "EVENT" | "ERROR";

export type ProposalStatus = "PROPOSED" | "VALIDATED" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export type MemoryType = "SHORT_TERM" | "LONG_TERM" | "EXPERIMENT";

export type MemoryCategory =
  | "STRATEGY_PERFORMANCE"
  | "PREDICTION_ACCURACY"
  | "CUSTOMER_PATTERN"
  | "MERCHANT_PATTERN";

export type GrowthCycleStatus =
  | "CREATED"
  | "OBSERVING"
  | "ANALYZING"
  | "STRATEGIZING"
  | "SIMULATING"
  | "DECIDING"
  | "GOVERNING"
  | "WAITING_APPROVAL"
  | "EXECUTING"
  | "OBSERVING_RESULT"
  | "LEARNING"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED";

export type EventType =
  | "CYCLE_STARTED"
  | "OPPORTUNITY_FOUND"
  | "STRATEGY_GENERATED"
  | "SIMULATION_COMPLETED"
  | "DECISION_MADE"
  | "SECURITY_CHECKED"
  | "GOVERNANCE_APPROVED"
  | "GOVERNANCE_BLOCKED"
  | "APPROVAL_REQUESTED"
  | "EXECUTION_STARTED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "PAYMENT_OBSERVED"
  | "OUTCOME_RECORDED"
  | "LEARNING_COMPLETED"
  | "AGENT_FAILED";

export type AutopilotMode = "OFF" | "REVIEW" | "LIMITED" | "FULL";

// ─── Agent Contract ──────────────────────────────────────────────

export interface AgentInput {
  merchantId: string;
  growthCycleId?: string;
  agentRunId?: string;
  taskType: string;
  data: Record<string, unknown>;
  context?: AgentContextData;
}

export interface AgentContextData {
  merchantId: string;
  growthCycleId?: string;
  currentStep?: string;
  previousResults?: Record<string, unknown>;
  autopilotMode?: AutopilotMode;
  merchantConfig?: MerchantAgentConfig;
}

export interface MerchantAgentConfig {
  maxDailySpendMinor: number;
  maxCampaignSpendMinor: number;
  maxCustomerSpendMinor: number;
  maxActionsPerHour: number;
  maxActionsPerDay: number;
  minimumConfidence: number;
  maximumRisk: number;
  approvalRequiredAboveMinor: number;
}

export interface AgentOutput {
  agentType: AgentType;
  agentRunId: string;
  taskId?: string;
  status: AgentStatus;
  confidence: number;
  reasoningSummary: string;
  evidence: string[];
  proposals: AgentProposalData[];
  warnings: string[];
  nextAction?: string;
  outputData?: Record<string, unknown>;
  createdAt: Date;
}

export interface AgentProposalData {
  proposalType: string;
  title: string;
  description: string;
  confidence: number;
  riskLevel: string;
  financialImpact?: {
    amountMinor: number;
    currency: string;
  };
  evidence?: string[];
}

// ─── Agent Contract Interface ────────────────────────────────────

export interface Agent {
  readonly agentType: AgentType;
  readonly name: string;
  readonly description: string;
  execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput>;
  validate(output: AgentOutput): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Agent Message ───────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  merchantId: string;
  growthCycleId?: string;
  senderAgent: AgentType;
  receiverAgent: AgentType;
  messageType: MessageType;
  payload: Record<string, unknown>;
  agentRunId?: string;
  taskId?: string;
  timestamp: Date;
}

// ─── Agent Registry ──────────────────────────────────────────────

export interface AgentRegistration {
  agentType: AgentType;
  agent: Agent;
  priority: number;
  isCritical: boolean;
}

// ─── Next Best Action ────────────────────────────────────────────

export interface NextBestAction {
  id: string;
  merchantId: string;
  actionType: string;
  title: string;
  why: string;
  expectedImpact: {
    revenueMinor: number;
    costMinor: number;
    netImpactMinor: number;
    roi: number;
  };
  confidence: number;
  riskLevel: string;
  requiredApproval: boolean;
  evidence: string[];
  proposedAt: Date;
}
