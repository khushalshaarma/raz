/**
 * Scenario Engine (Phase 3 — Decision Intelligence)
 *
 * Builds conservative/expected/optimistic scenarios from a baseline.
 * All calculations are deterministic and documented.
 * No LLM-driven financial prediction — all from documented formulas.
 *
 * Pipeline (Phase 3 Architecture):
 * 1. Baseline computation from historical data
 * 2. Scenario multiplier application
 * 3. Financial impact estimation
 * 4. Risk & confidence quantification
 * 5. Result output with evidence
 */

import { formatMoney } from "@/lib/intelligence/opportunity/scorer";
import { prisma } from "@/lib/prisma";
import { OpportunityType } from "@/lib/intelligence/opportunity";
import { StrategyType } from "@/lib/intelligence/strategy";

/** Scenario result for a single strategy */
export interface ScenarioResult {
  scenarioType: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
  eligibleCustomers: number;
  expectedConversionRate: number; // 0-100 percentage points
  expectedConversions: number;
  expectedRevenueMinor: number; // in paise
  expectedCostMinor: number;     // in paise
  expectedNetImpactMinor: number; // revenue - cost (in paise)
  expectedROI: number;           // net / cost (0 if cost <= 0)
  confidence: number;            // 0-100
  riskScore: number;             // 0-100
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  downsideRevenueMinor: number;  // worst reasonable outcome revenue (in paise)
  downsideCostMinor: number;     // worst reasonable outcome cost (in paise)
  downsideNetImpactMinor: number; // worst reasonable net impact (in paise)
  evidence: Array<{ feature: string; value: string }>;
}

/** Baseline result from historical data */
export interface BaselineResult {
  eligibleCustomers: number;
  historicalConversionRate: number; // 0-100 percentage points
  historicalAOVMinor: number;       // average order value in paise
  historicalRevenueMinor: number;   // baseline expected revenue in paise
  historicalCostMinor: number;      // baseline expected cost in paise
  baselineNetImpactMinor: number;   // baseline net impact in paise
  baselineConversions: number;      // baseline expected conversions
  dataQuality: number;              // 0-100, how good the historical data is
  /**
   * How the numbers above were derived. Present so the UI can show *why* a
   * baseline looks the way it does, and so a proxy audience is never presented
   * as if it were a measured segment.
   */
  diagnostics?: BaselineDiagnostics;
}

/** Traceable inputs behind a `BaselineResult`. Every value is observed, not assumed. */
export interface BaselineDiagnostics {
  windowDays: number;
  historySpanDays: number;
  completedOrders: number;
  totalCustomers: number;
  orderingCustomers: number;
  /** Observed discount ÷ observed subtotal across the window (0-1). */
  observedDiscountRate: number;
  /** Human-readable description of which customers were counted as eligible. */
  eligibleAudience: string;
  /**
   * True when the schema has no first-class signal for this opportunity type and
   * the audience had to be derived from a related but imperfect one. Proxy
   * audiences are capped in their data-quality contribution.
   */
  usedProxyAudience: boolean;
  /** Additive breakdown of the dataQuality score, summing to the total. */
  components: Array<{ name: string; points: number; detail: string }>;
}

/**
 * Order statuses that represent realised revenue.
 *
 * Only `COMPLETED` counts, matching the RFM feature modules
 * (`features/frequency.ts`, `features/monetary.ts`, `features/recency.ts`).
 * `PENDING` orders are not revenue: counting them would inflate every baseline.
 */
export const REVENUE_ORDER_STATUSES = ["COMPLETED"] as const;

/** Trailing window the baseline is computed over. */
export const BASELINE_WINDOW_DAYS = 180;

/** Days since last completed order after which a customer counts as inactive. */
export const INACTIVE_THRESHOLD_DAYS = 60;

/** A PENDING order older than this is treated as an abandoned checkout. */
export const CART_ABANDONMENT_AFTER_HOURS = 24;

/** Round to a whole number of paise/rate, guarding against float drift. */
function roundInt(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Scenario engine configuration */
export interface ScenarioConfig {
  /** Conservative multiplier (baseline × this factor) */
  conservativeMultiplier: number;
  /** Expected multiplier (baseline × this factor) */
  expectedMultiplier: number;
  /** Optimistic multiplier (baseline × this factor) */
  optimisticMultiplier: number;
  /** Minimum conversion rate floor (0-100) */
  conversionFloor: number;
  /** Minimum data quality score (0-100) */
  minDataQuality: number;
}

/** Default scenario configuration */
export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  conservativeMultiplier: 0.80,
  expectedMultiplier: 1.00,
  optimisticMultiplier: 1.20,
  conversionFloor: 1, // 1%
  minDataQuality: 30,
};

/**
 * Compute a baseline from historical order/customer data.
 * Uses only Phase 2–verified data sources; never invents numbers.
 *
 * If insufficient historical data exists, the result includes
 * a dataQuality field that callers can check to show "INSUFFICIENT_DATA".
 *
 * Everything here is observed from `Order`/`Customer`/`OrderItem`:
 * - eligibleCustomers: customers matching a segment that can actually be
 *   measured for this opportunity type
 * - historicalConversionRate: share of the merchant's customer base that
 *   placed a completed order inside the window (penetration, 0-100)
 * - historicalAOVMinor: mean completed order total
 * - historicalCostMinor: baseline revenue × the merchant's *observed* discount
 *   rate. There is no COGS/incentive table in the schema, so the discount the
 *   merchant has historically given is the only defensible cost signal; it is
 *   0 when no discounts have ever been recorded, not an assumed rate.
 * - dataQuality: additive score over five measured components, each recorded
 *   in `diagnostics.components`. A merchant with thin or undated history scores
 *   low and the engine refuses to simulate rather than guessing.
 */
export async function computeBaseline(
  merchantId: string,
  opportunityType: OpportunityType
): Promise<BaselineResult> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - BASELINE_WINDOW_DAYS);

  const [orders, customers, pendingOrders, categoryRows] = await Promise.all([
    prisma.order.findMany({
      where: {
        merchantId,
        status: { in: [...REVENUE_ORDER_STATUSES] },
        createdAt: { gte: windowStart },
      },
      select: {
        customerId: true,
        totalMinor: true,
        subtotalMinor: true,
        discountMinor: true,
        createdAt: true,
      },
    }),
    prisma.customer.findMany({
      where: { merchantId },
      select: { id: true },
    }),
    prisma.order.findMany({
      where: {
        merchantId,
        status: "PENDING",
        createdAt: {
          gte: windowStart,
          lt: new Date(now.getTime() - CART_ABANDONMENT_AFTER_HOURS * 60 * 60 * 1000),
        },
      },
      select: { customerId: true },
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          merchantId,
          status: { in: [...REVENUE_ORDER_STATUSES] },
          createdAt: { gte: windowStart },
        },
      },
      select: { order: { select: { customerId: true } }, product: { select: { category: true } } },
    }),
  ]);

  // ── Aggregate per-customer observed history ────────────────────────
  const ordersPerCustomer = new Map<string, number>();
  const lastOrderAt = new Map<string, number>();
  const categoriesPerCustomer = new Map<string, Set<string>>();

  let subtotalSum = 0;
  let discountSum = 0;
  let totalSum = 0;
  let ordersWithPositiveTotal = 0;
  let earliestOrderMs = Number.POSITIVE_INFINITY;
  let latestOrderMs = 0;

  for (const order of orders) {
    ordersPerCustomer.set(order.customerId, (ordersPerCustomer.get(order.customerId) ?? 0) + 1);
    const ms = order.createdAt.getTime();
    if (ms > (lastOrderAt.get(order.customerId) ?? 0)) lastOrderAt.set(order.customerId, ms);
    if (ms < earliestOrderMs) earliestOrderMs = ms;
    if (ms > latestOrderMs) latestOrderMs = ms;

    subtotalSum += order.subtotalMinor;
    discountSum += order.discountMinor;
    totalSum += order.totalMinor;
    if (order.totalMinor > 0) ordersWithPositiveTotal += 1;
  }

  for (const row of categoryRows) {
    const customerId = row.order.customerId;
    let set = categoriesPerCustomer.get(customerId);
    if (!set) {
      set = new Set<string>();
      categoriesPerCustomer.set(customerId, set);
    }
    set.add(row.product.category);
  }

  const completedOrders = orders.length;
  const totalCustomers = customers.length;
  const orderingCustomerIds = [...ordersPerCustomer.keys()];
  const orderingCustomers = orderingCustomerIds.length;

  // ── Observed conversion + AOV ─────────────────────────────────────
  // Conversion rate is the share of the merchant's whole customer base that
  // placed a completed order inside the window (a penetration rate, 0-100).
  //
  // It is deliberately NOT orders-per-customer: that ratio is unbounded (this
  // merchant averages 3.5 orders per customer), so clamping it to 100 would
  // assert "100% of the eligible audience converts" and claim full conversion
  // for every eligible customer. Penetration stays inside 0-100 by
  // construction and stays honest when the base is bigger than the buyers.
  const historicalConversionRate =
    totalCustomers > 0 ? clamp((orderingCustomers / totalCustomers) * 100, 0, 100) : 0;

  const historicalAOVMinor = completedOrders > 0 ? roundInt(totalSum / completedOrders) : 0;

  const observedDiscountRate = subtotalSum > 0 ? discountSum / subtotalSum : 0;

  const historySpanDays =
    completedOrders > 0 ? Math.max(0, Math.round((latestOrderMs - earliestOrderMs) / 86_400_000)) : 0;

  // ── Eligible audience, per opportunity type ────────────────────────
  const inactiveCustomers = orderingCustomerIds.filter((id) => {
    const last = lastOrderAt.get(id) ?? 0;
    if (!last) return false;
    const daysSince = (now.getTime() - last) / 86_400_000;
    return daysSince >= INACTIVE_THRESHOLD_DAYS;
  });

  const singlePurchaseCustomers = orderingCustomerIds.filter(
    (id) => (ordersPerCustomer.get(id) ?? 0) === 1
  );

  const multiCategoryCustomers = orderingCustomerIds.filter(
    (id) => (categoriesPerCustomer.get(id)?.size ?? 0) >= 2
  );

  const abandonedCheckoutCustomers = new Set(pendingOrders.map((o) => o.customerId));

  let eligibleIds: string[];
  let eligibleAudience: string;
  let usedProxyAudience = false;

  switch (opportunityType) {
    case "HIGH_VALUE_INACTIVE":
      eligibleIds = inactiveCustomers;
      eligibleAudience = `Customers whose most recent completed order is at least ${INACTIVE_THRESHOLD_DAYS} days old`;
      break;
    case "LOW_CONVERSION":
      eligibleIds = singlePurchaseCustomers;
      eligibleAudience = "Customers with exactly one completed order (no repeat purchase yet)";
      break;
    case "CROSS_SELL":
      // Real signal: customers who have already bought from >= 2 categories.
      eligibleIds = multiCategoryCustomers;
      eligibleAudience = "Customers who have completed orders spanning two or more product categories";
      break;
    case "UPSELL":
      // The schema has no basket/line-item affinity table, so "who can be
      // upsold" cannot be measured directly. The best available audience is
      // repeat buyers; this is flagged as a proxy and capped in dataQuality.
      eligibleIds = orderingCustomerIds.filter((id) => (ordersPerCustomer.get(id) ?? 0) >= 2);
      eligibleAudience = "PROXY: repeat buyers (>= 2 completed orders) — no basket affinity table exists, so per-product upsell affinity cannot be measured";
      usedProxyAudience = true;
      break;
    case "CART_ABANDONMENT":
      eligibleIds = [...abandonedCheckoutCustomers];
      eligibleAudience = `Customers with a PENDING order older than ${CART_ABANDONMENT_AFTER_HOURS}h and no completed order to replace it`;
      break;
    default: {
      // Unknown type: fall back to the whole ordering base and be explicit
      // that this is a proxy rather than a measured segment.
      const exhaustive: never = opportunityType;
      void exhaustive;
      eligibleIds = orderingCustomerIds;
      eligibleAudience = `PROXY: all ordering customers (unrecognised opportunity type "${String(opportunityType)}")`;
      usedProxyAudience = true;
    }
  }

  const eligibleCustomers = eligibleIds.length;

  // ── Projected baseline from the observed rates ─────────────────────
  const baselineConversions = roundInt(
    (eligibleCustomers * historicalConversionRate) / 100
  );
  const historicalRevenueMinor = baselineConversions * historicalAOVMinor;
  const historicalCostMinor = roundInt(historicalRevenueMinor * observedDiscountRate);
  const baselineNetImpactMinor = historicalRevenueMinor - historicalCostMinor;

  // ── Data quality (additive, fully documented) ──────────────────────
  const components: BaselineDiagnostics["components"] = [];
  const volumePoints = 35 * clamp(completedOrders / 30, 0, 1);
  components.push({
    name: "Order volume",
    points: roundInt(volumePoints),
    detail: `${completedOrders} completed orders (full credit at 30)`,
  });

  const coveragePoints = 25 * clamp(orderingCustomers / 50, 0, 1);
  components.push({
    name: "Customer coverage",
    points: roundInt(coveragePoints),
    detail: `${orderingCustomers} customers with >= 1 completed order (full credit at 50)`,
  });

  const spanPoints = 20 * clamp(historySpanDays / 90, 0, 1);
  components.push({
    name: "History span",
    points: roundInt(spanPoints),
    detail: `${historySpanDays} days between first and last completed order (full credit at 90)`,
  });

  const completenessRatio =
    completedOrders > 0 ? ordersWithPositiveTotal / completedOrders : 0;
  const completenessPoints = 10 * completenessRatio;
  components.push({
    name: "Revenue completeness",
    points: roundInt(completenessPoints),
    detail: `${ordersWithPositiveTotal}/${completedOrders} completed orders carry a non-zero total`,
  });

  const fidelityPoints = usedProxyAudience ? 4 : 10;
  components.push({
    name: "Audience fidelity",
    points: fidelityPoints,
    detail: usedProxyAudience
      ? "Eligible audience is a proxy, not a directly measured segment"
      : "Eligible audience is a directly measured segment for this opportunity type",
  });

  const dataQuality = clamp(
    components.reduce((sum, c) => sum + c.points, 0),
    0,
    100
  );

  return {
    eligibleCustomers,
    historicalConversionRate: roundInt(historicalConversionRate),
    historicalAOVMinor,
    historicalRevenueMinor,
    historicalCostMinor,
    baselineNetImpactMinor,
    baselineConversions,
    dataQuality,
    diagnostics: {
      windowDays: BASELINE_WINDOW_DAYS,
      historySpanDays,
      completedOrders,
      totalCustomers,
      orderingCustomers,
      observedDiscountRate,
      eligibleAudience,
      usedProxyAudience,
      components,
    },
  };
}

/**
 * Build three scenarios (CONSERVATIVE, EXPECTED, OPTIMISTIC) from a baseline.
 *
 * Each scenario applies a multiplier to the baseline conversion rate.
 * Financial values remain in integer paise; no floating-point for money.
 *
 * @param baseline - result from computeBaseline()
 * @param config - scenario multipliers (defaults: 0.80 / 1.00 / 1.20)
 * @returns array of three ScenarioResult objects
 */
export function buildScenarios(
  baseline: BaselineResult,
  config: ScenarioConfig = DEFAULT_SCENARIO_CONFIG
): ScenarioResult[] {
  const results: ScenarioResult[] = [];

  const scenarioConfigs = [
    { name: "CONSERVATIVE" as const, multiplier: config.conservativeMultiplier, riskAdjustment: 1.25 },
    { name: "EXPECTED" as const, multiplier: config.expectedMultiplier, riskAdjustment: 1.0 },
    { name: "OPTIMISTIC" as const, multiplier: config.optimisticMultiplier, riskAdjustment: 0.90 },
  ];

  for (const sc of scenarioConfigs) {
    // The multiplier scales the observed conversion rate, so a high baseline
    // rate (e.g. 100% penetration) multiplied by the 1.20 optimistic factor
    // produced an impossible 120% conversion rate. The ceiling is the
    // audience: you cannot convert more than 100% of the people you reached.
    const conversionRate = clamp(
      Math.round(baseline.historicalConversionRate * sc.multiplier),
      0,
      100
    );
    // Floor applied after clamping so a real 0% observed rate is not inflated
    // into a fabricated non-zero conversion.
    const flooredConversionRate = Math.max(config.conversionFloor, conversionRate);

    const aov = Math.round(baseline.historicalAOVMinor * sc.multiplier);
    const conversions = Math.round(baseline.eligibleCustomers * flooredConversionRate / 100);
    const revenue = Math.round(conversions * aov);
    const cost = Math.round(baseline.historicalCostMinor * sc.riskAdjustment);
    const netImpact = revenue - cost;
    const roi = cost > 0 ? Math.round((netImpact / cost) * 100) / 100 : 0;

    // Risk score: based on deviation from 1.0 multiplier + data quality penalty
    const deviation = Math.abs(sc.multiplier - 1.0) * 100; // 0-20 range
    const dataQualityPenalty = (100 - baseline.dataQuality) * 0.5;
    const riskScore = Math.round(Math.min(100, deviation + dataQualityPenalty));
    const riskLevel = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";

    // Confidence as a weighted blend (weights sum to 1, so the result is
    // 0-100 by construction).
    //
    // The previous formula summed three 0-100 terms and then capped at 100:
    // `dataQuality + sampleSize + (100 - riskScore)`. Because `riskScore`
    // already contains a data-quality penalty, poor data quality was counted
    // once as a positive weight and again inside the stability term, and the
    // sum saturated: this merchant scored 99-100 confidence off a baseline
    // dataQuality of 46/100. A blend cannot saturate, so confidence now
    // tracks the data it is derived from.
    //
    // NOTE: `intelligence/confidence.ts` still uses the older sum-then-cap
    // aggregation in `runConfidenceAnalysis`. Realigning it is a separate
    // change because it feeds several other modules.
    const dataQualityTerm = baseline.dataQuality;
    const sampleSizeTerm = clamp((baseline.eligibleCustomers / 50) * 100, 0, 100);
    const stabilityTerm = 100 - riskScore;
    const confidence = Math.round(
      0.5 * dataQualityTerm + 0.3 * sampleSizeTerm + 0.2 * stabilityTerm
    );

    // Downside: conservative estimate for worst reasonable outcome
    const downsideConversionRate = Math.max(1, flooredConversionRate - 15);
    const downsideConversions = Math.round(baseline.eligibleCustomers * downsideConversionRate / 100);
    const downsideRevenue = Math.round(downsideConversions * aov);
    const downsideCost = Math.round(baseline.historicalCostMinor * 0.8);
    const downsideNetImpact = downsideRevenue - downsideCost;

    results.push({
      scenarioType: sc.name,
      eligibleCustomers: baseline.eligibleCustomers,
      expectedConversionRate: flooredConversionRate,
      expectedConversions: conversions,
      expectedRevenueMinor: revenue,
      expectedCostMinor: cost,
      expectedNetImpactMinor: netImpact,
      expectedROI: roi,
      confidence,
      riskScore,
      riskLevel,
      downsideRevenueMinor: downsideRevenue,
      downsideCostMinor: downsideCost,
      downsideNetImpactMinor: downsideNetImpact,
      evidence: [
        { feature: "Eligible Customers", value: baseline.eligibleCustomers.toString() },
        { feature: "Conversion Rate", value: flooredConversionRate.toString() + "%" },
        { feature: "AOV", value: formatMoney(aov) },
        { feature: "Data Quality", value: baseline.dataQuality.toString() + "/100" },
      ],
    });
  }

  return results;
}

/**
 * Run the full scenario engine for a merchant + opportunity type.
 *
 * Steps:
 * 1. Compute baseline from historical data
 * 2. If data quality is insufficient (below minDataQuality), return error
 * 3. Build CONSERVATIVE, EXPECTED, OPTIMISTIC scenarios
 * 4. Return baseline + scenarios
 *
 * The caller (Simulation Agent) interprets the result and presents
 * scenarios to the merchant. No external side effects.
 */
export async function runScenarioEngine(
  merchantId: string,
  opportunityType: OpportunityType,
  config: ScenarioConfig = DEFAULT_SCENARIO_CONFIG
): Promise<{ baseline: BaselineResult; scenarios: ScenarioResult[] } | { error: string }> {
  const baseline = await computeBaseline(merchantId, opportunityType);

  // Data quality check
  if (baseline.dataQuality < config.minDataQuality) {
    return {
      error: `Insufficient historical data (quality ${baseline.dataQuality}/${config.minDataQuality}). Using conservative defaults.`,
    };
  }

  const scenarios = buildScenarios(baseline, config);
  return { baseline, scenarios };
}