/**
 * Merchant dashboard overview — response contract.
 *
 * This module is intentionally free of any Prisma / server-only imports so that
 * it can be imported by BOTH the API route (server) and the dashboard page
 * (client component). It is the single source of truth for the shape of
 * `GET /api/merchant/overview`.
 *
 * The dashboard previously crashed with
 *   "Cannot read properties of undefined (reading 'totalRuns')"
 * because error envelopes (`{ error: "..." }`) and partially populated payloads
 * were dereferenced as if they were valid data. The helpers below make the
 * contract explicit and guarantee that every documented field is always present
 * with a usable value, so an incomplete payload degrades to legitimate zeros
 * instead of throwing.
 */

export type MetricTrend = "UP" | "DOWN" | "FLAT";
export type MetricSource = "REAL" | "INSUFFICIENT_DATA";

export interface MetricSummary {
  value: number;
  formattedValue: string;
  period: string;
  comparison: number;
  trend: MetricTrend;
  source: MetricSource;
}

export interface AgentActivity {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  lastRunAt: string | null;
  successRate: number;
}

export type RiskAlertType =
  | "EMERGENCY_STOP"
  | "AUTOMATION_PAUSED"
  | "HIGH_RISK_ACTION"
  | "PAYMENT_FAILURE"
  | "GOVERNANCE_BLOCK";

export type RiskAlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface RiskAlert {
  type: RiskAlertType;
  message: string;
  severity: RiskAlertSeverity;
  timestamp: string;
}

export interface AiBuyerActivityItem {
  time: string;
  query: string;
  productName: string;
  status: string;
  amount: number;
}

export interface AiBuyerActivity {
  totalRequests: number;
  pendingApprovals: number;
  approvedPurchases: number;
  checkoutStarted: number;
  successfulPurchases: number;
  rejectedPurchases: number;
  recentActivity: AiBuyerActivityItem[];
}

export interface MerchantOverview {
  revenue: MetricSummary;
  orders: MetricSummary;
  customers: MetricSummary;
  conversion: MetricSummary;
  averageOrderValue: MetricSummary;
  repeatCustomerRate: MetricSummary;
  paymentSuccessRate: MetricSummary;
  growthOpportunities: number;
  activeStrategies: number;
  pendingApprovals: number;
  recentExecutions: number;
  agentActivity: AgentActivity;
  riskAlerts: RiskAlert[];
  aiBuyerActivity: AiBuyerActivity;
}

/** Shape returned by the API for every non-2xx response. */
export interface ApiErrorEnvelope {
  error: string;
}

/** A merchant with no agent runs is a legitimate empty state, not a failure. */
export const EMPTY_AGENT_ACTIVITY: AgentActivity = Object.freeze({
  totalRuns: 0,
  completedRuns: 0,
  failedRuns: 0,
  lastRunAt: null,
  successRate: 0,
});

export const EMPTY_AI_BUYER_ACTIVITY: AiBuyerActivity = Object.freeze({
  totalRequests: 0,
  pendingApprovals: 0,
  approvedPurchases: 0,
  checkoutStarted: 0,
  successfulPurchases: 0,
  rejectedPurchases: 0,
  recentActivity: [],
}) as AiBuyerActivity;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce anything to a finite number, falling back to `fallback`. */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Detect the `{ error: "..." }` envelope the API returns for non-2xx responses.
 * The dashboard used to treat this object as a successful payload.
 */
export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return isRecord(value) && typeof value.error === "string";
}

export function normalizeAgentActivity(value: unknown): AgentActivity {
  if (!isRecord(value)) return { ...EMPTY_AGENT_ACTIVITY };

  const totalRuns = toFiniteNumber(value.totalRuns);
  const completedRuns = toFiniteNumber(value.completedRuns);
  const failedRuns = toFiniteNumber(value.failedRuns);
  const successRate = toFiniteNumber(
    value.successRate,
    totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 0
  );

  return {
    totalRuns,
    completedRuns,
    failedRuns,
    lastRunAt: typeof value.lastRunAt === "string" ? value.lastRunAt : null,
    successRate,
  };
}

function normalizeTrend(value: unknown): MetricTrend {
  return value === "UP" || value === "DOWN" || value === "FLAT" ? value : "FLAT";
}

function normalizeSource(value: unknown): MetricSource {
  return value === "REAL" ? "REAL" : "INSUFFICIENT_DATA";
}

function normalizeMetric(value: unknown, fallbackText = "—"): MetricSummary {
  const raw = isRecord(value) ? value : {};
  return {
    value: toFiniteNumber(raw.value),
    formattedValue: typeof raw.formattedValue === "string" ? raw.formattedValue : fallbackText,
    period: typeof raw.period === "string" ? raw.period : "",
    comparison: toFiniteNumber(raw.comparison),
    trend: normalizeTrend(raw.trend),
    source: normalizeSource(raw.source),
  };
}

function normalizeRiskAlerts(value: unknown): RiskAlert[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((alert) => ({
    type: (typeof alert.type === "string" ? alert.type : "HIGH_RISK_ACTION") as RiskAlertType,
    message: typeof alert.message === "string" ? alert.message : "",
    severity: (alert.severity === "MEDIUM" || alert.severity === "LOW"
      ? alert.severity
      : "HIGH") as RiskAlertSeverity,
    timestamp: typeof alert.timestamp === "string" ? alert.timestamp : new Date(0).toISOString(),
  }));
}

function normalizeAiBuyerActivity(value: unknown): AiBuyerActivity {
  if (!isRecord(value)) return { ...EMPTY_AI_BUYER_ACTIVITY, recentActivity: [] };

  const recentActivity = Array.isArray(value.recentActivity)
    ? value.recentActivity.filter(isRecord).map((item) => ({
        time: typeof item.time === "string" ? item.time : "",
        query: typeof item.query === "string" ? item.query : "",
        productName: typeof item.productName === "string" ? item.productName : "",
        status: typeof item.status === "string" ? item.status : "UNKNOWN",
        amount: toFiniteNumber(item.amount),
      }))
    : [];

  return {
    totalRequests: toFiniteNumber(value.totalRequests),
    pendingApprovals: toFiniteNumber(value.pendingApprovals),
    approvedPurchases: toFiniteNumber(value.approvedPurchases),
    checkoutStarted: toFiniteNumber(value.checkoutStarted),
    successfulPurchases: toFiniteNumber(value.successfulPurchases),
    rejectedPurchases: toFiniteNumber(value.rejectedPurchases),
    recentActivity,
  };
}

/**
 * Guarantee the documented `MerchantOverview` shape from an unknown payload.
 *
 * Never throws: malformed or missing fields degrade to zero / empty values so
 * the dashboard can always render a legitimate empty state.
 */
export function normalizeMerchantOverview(value: unknown): MerchantOverview {
  const raw = isRecord(value) ? value : {};
  return {
    revenue: normalizeMetric(raw.revenue),
    orders: normalizeMetric(raw.orders),
    customers: normalizeMetric(raw.customers),
    conversion: normalizeMetric(raw.conversion),
    averageOrderValue: normalizeMetric(raw.averageOrderValue),
    repeatCustomerRate: normalizeMetric(raw.repeatCustomerRate),
    paymentSuccessRate: normalizeMetric(raw.paymentSuccessRate),
    growthOpportunities: toFiniteNumber(raw.growthOpportunities),
    activeStrategies: toFiniteNumber(raw.activeStrategies),
    pendingApprovals: toFiniteNumber(raw.pendingApprovals),
    recentExecutions: toFiniteNumber(raw.recentExecutions),
    agentActivity: normalizeAgentActivity(raw.agentActivity),
    riskAlerts: normalizeRiskAlerts(raw.riskAlerts),
    aiBuyerActivity: normalizeAiBuyerActivity(raw.aiBuyerActivity),
  };
}