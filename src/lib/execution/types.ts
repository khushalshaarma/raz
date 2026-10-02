export type ExecutionStatus =
  | "CREATED"
  | "PREFLIGHT"
  | "READY"
  | "EXECUTING"
  | "SUBMITTED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "RECONCILING"
  | "RECONCILED"
  | "UNKNOWN";

export type ExecutionResult = "READY" | "BLOCKED" | "EXPIRED" | "ALREADY_EXECUTED" | "EMERGENCY_STOP" | "AUTOMATION_PAUSED" | "GOVERNANCE_INVALID" | "SECURITY_FAILURE" | "IDEMPOTENCY_CONFLICT";

export interface ExecutionReadyAction {
  id: string;
  merchantId: string;
  governanceDecisionId: string;
  decisionId: string;
  actionRequestId: string;
  actionType: string;
  strategyId: string;
  targetId?: string;
  amountMinor: number;
  currency: string;
  policyVersion: number;
  approvedAt: Date;
  approvedBy: string;
  idempotencyKey: string;
  expiresAt: Date;
  securitySnapshot: Record<string, unknown>;
  riskSnapshot: Record<string, unknown>;
  confidenceSnapshot: Record<string, unknown>;
}

export interface ExecutionResultOut {
  id: string;
  merchantId: string;
  governanceDecisionId: string;
  actionRequestId: string;
  idempotencyKey: string | null;
  actionType: string;
  strategyId: string;
  amountMinor: number;
  currency: string;
  status: ExecutionStatus;
  provider: string;
  providerReference: string | null;
  failureCode: string | null;
  failureReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionAttemptOut {
  id: string;
  executionId: string;
  attemptNumber: number;
  provider: string;
  requestHash: string | null;
  idempotencyKey: string | null;
  providerReference: string | null;
  status: string;
  responseCode: string | null;
  failureCode: string | null;
  failureReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface PreflightResult {
  status: ExecutionResult;
  reason?: string;
  execution?: ExecutionResultOut;
}

export interface ProviderOrder {
  id: string;
  amountMinor: number;
  currency: string;
  receipt?: string;
  metadata: Record<string, string>;
}

export interface ProviderPayment {
  id: string;
  orderId: string;
  status: string;
  amountMinor: number;
  currency: string;
  providerPaymentId: string | null;
  failureCode: string | null;
  failureReason: string | null;
}

export interface ProviderRefund {
  id: string;
  paymentId: string;
  status: string;
  amountMinor: number;
  currency: string;
  providerRefundId: string | null;
  failureCode: string | null;
  failureReason: string | null;
}

export interface WebhookPayload {
  id: string;
  event: string;
  entity: Record<string, unknown>;
  created_at: number;
}

export interface ReconciliationResult {
  id: string;
  executionId: string;
  merchantId: string;
  provider: string;
  providerReference: string | null;
  providerStatus: string | null;
  growthOSStatus: string | null;
  amountMinor: number | null;
  currency: string | null;
  amountMatch: boolean | null;
  statusMatch: boolean | null;
  status: string;
  mismatchReason: string | null;
  resolvedAt: Date | null;
}

export interface OutcomeData {
  id: string;
  executionId: string;
  decisionId: string;
  strategyId: string;
  merchantId: string;
  predictedRevenueMinor: number;
  actualRevenueMinor: number | null;
  predictedCostMinor: number;
  actualCostMinor: number | null;
  predictedNetImpactMinor: number;
  actualNetImpactMinor: number | null;
  predictedROI: number;
  actualROI: number | null;
  predictedConversion: number;
  actualConversion: number | null;
  source: "SIMULATED" | "REAL";
  status: string;
}

export type RetryClassification = "SAFE_TO_RETRY" | "NOT_SAFE_TO_RETRY" | "UNKNOWN";

export interface FailureCategory {
  type: "CUSTOMER_ERROR" | "PAYMENT_DECLINED" | "INSUFFICIENT_FUNDS" | "NETWORK_ERROR" | "PROVIDER_ERROR" | "AUTH_ERROR" | "VALIDATION_ERROR" | "DUPLICATE" | "UNKNOWN";
  code: string;
  recoverable: boolean;
  retryAllowed: boolean;
}
