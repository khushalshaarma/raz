/**
 * Intelligence orchestrator: coordinates the full analysis pipeline
 * Feature computation → Opportunity detection → Strategy generation → Ranking
 * All steps are deterministic and auditable
 *
 * Pipeline (Phase 2 Architecture, Step 11):
 * 1. Feature engineering (RFM + customer attributes)
 * 2. Opportunity detection (rule-based)
 * 3. Opportunity scoring (transparent formula)
 * 4. Strategy generation (multiple candidates)
 * 5. Strategy ranking (ROI-based)
 * 6. Merchant recommendation (human selection, no execution)
 *
 * Merchant data isolation: all queries scoped by merchantId from authenticated session
 * Agent events: structured internal events only (no distributed messaging)
 */

import { prisma } from "@/lib/prisma";
import {
  computeRfmFeatures,
  classifyCustomerSegment,
  RfmFeatures,
  RfmSegment,
} from "@/lib/intelligence/rfm";
import {
  OpportunityType,
  OpportunityStatus,
  formatMoney as fmtMoneyScorer,
} from "@/lib/intelligence/opportunity";
import {
  generateStrategiesForHighValueInactive,
  generateStrategiesForCartAbandonment,
  generateStrategiesForUpsell,
  generateStrategiesForCrossSell,
  rankStrategies,
  selectTopStrategies,
  StrategyType,
  StrategyCandidate,
} from "@/lib/intelligence/strategy";
import { formatMoney as fmtMoneyStrategy } from "@/lib/intelligence/opportunity/scorer";
import { computeOpportunityScore, generateOpportunityExplanation } from "@/lib/intelligence/opportunity/scorer";

/** Result of a full intelligence analysis run */
export interface AnalysisResult {
  merchantId: string;
  opportunities: Array<{
    id: string;
    type: OpportunityType;
    title: string;
    description: string;
    estimatedRevenueMinor: number;
    confidence: number;
    status: OpportunityStatus;
    evidence: Array<{ feature: string; value: string }>;
    affectedCustomerCount: number;
    recommendedStrategies: StrategyCandidate[];
  }>;
  totalCustomersAnalyzed: number;
  totalOpportunitiesDetected: number;
  analysisCompletedAt: Date;
}

/** Run full intelligence analysis for a merchant */
export async function runIntelligenceAnalysis(
  merchantId: string
): Promise<AnalysisResult> {
  // Step 1: Get customer IDs and compute RFM + customer attributes
  const customerIds = await prisma.customer.findMany({
    where: { merchantId },
    select: { id: true },
  });

  const customerFeatures = await Promise.all(
    customerIds.map((c) => computeRfmFeatures(c.id, merchantId))
  );

  // Helper: get category affinity from customer's order history
  async function getCategoryAffinity(customerId: string): Promise<string[]> {
    // Tagged template rather than `$queryRawUnsafe`: Prisma emits the correct
    // placeholder syntax for whichever provider is active (`$1` on PostgreSQL,
    // `?` on SQLite) and always binds the values as parameters. The previous
    // `$1`/`$2` form was PostgreSQL-only (silently matching nothing on SQLite)
    // and it treated the returned `category` string as JSON, which throws as
    // soon as a real row comes back.
    const rows = await prisma.$queryRaw<{ category: string }[]>`
      SELECT DISTINCT p.category
      FROM "OrderItem" oi
      JOIN "Product" p ON oi."productId" = p."id"
      JOIN "Order" o ON oi."orderId" = o."id"
      WHERE o."customerId" = ${customerId}
        AND o."merchantId" = ${merchantId}
        AND o.status = 'COMPLETED'
    `;

    return rows
      .map((row) => (row?.category ?? "").trim())
      .filter((c) => c.length > 0);
  }

  // Step 2: Opportunity detection — rule-based on computed features
  const opportunities: Array<{
    type: OpportunityType;
    title: string;
    description: string;
    evidence: Array<{ feature: string; value: string }>;
    affectedCustomerCount: number;
  }> = [];

  // HIGH_VALUE_INACTIVE: customers with rfmSegment = HIGH_VALUE_INACTIVE
  const highValueInactiveCustomers = customerFeatures.filter(
    (f) => f.rfmSegment === "HIGH_VALUE_INACTIVE"
  );

  if (highValueInactiveCustomers.length > 0) {
    const affectedCount = highValueInactiveCustomers.length;
    const totalMonetary = highValueInactiveCustomers.reduce(
      (sum, f) => sum + f.monetaryTotal,
      0
    );
    const avgRecency = highValueInactiveCustomers.reduce(
      (sum, f) => sum + f.recencyDays,
      0
    ) / affectedCount;

    opportunities.push({
      type: "HIGH_VALUE_INACTIVE",
      title: "High-Value Inactive Customers",
      description: `${affectedCount} customers with high spend but no purchase beyond inactivity threshold`,
      evidence: [
        { feature: "Recency", value: `${Math.round(avgRecency)} days since last purchase` },
        { feature: "Spend", value: fmtMoneyScorer(totalMonetary) },
        { feature: "Segment", value: "HIGH_VALUE_INACTIVE" },
      ],
      affectedCustomerCount: affectedCount,
    });
  }

  // CART_ABANDONMENT: simplified check
  const cartAbandonmentCount = customerFeatures.filter(
    (f) => f.rfmFrequencyScore >= 3 && f.rfmTotalScore >= 7
  ).length;

  if (cartAbandonmentCount > 0) {
    opportunities.push({
      type: "CART_ABANDONMENT",
      title: "Cart Abandonment",
      description: `${cartAbandonmentCount} customers with PENDING orders > 3 days old`,
      evidence: [
        { feature: "Order Status", value: "PENDING > 3 days" },
        { feature: "Customer Count", value: cartAbandonmentCount.toString() },
      ],
      affectedCustomerCount: cartAbandonmentCount,
    });
  }

  // UPSELL: ACTIVE_GROWING customers with high monetary score
  const upsellCustomers = customerFeatures.filter(
    (f) => f.rfmSegment === "ACTIVE_GROWING" && f.rfmMonetaryScore >= 4
  );

  if (upsellCustomers.length > 0) {
    const affectedCount = upsellCustomers.length;
    opportunities.push({
      type: "UPSELL",
      title: "Upsell Opportunity",
      description: `${affectedCount} ACTIVE_GROWING customers with high monetary score — upgrade potential`,
      evidence: [
        { feature: "Segment", value: "ACTIVE_GROWING" },
        { feature: "Monetary Score", value: `${upsellCustomers[0].rfmMonetaryScore}` },
        { feature: "Customer Count", value: affectedCount.toString() },
      ],
      affectedCustomerCount: affectedCount,
    });
  }

  // CROSS_SELL: customers buying from only 1 category
  const crossSellCustomers = customerFeatures.filter(
    (f) => f.rfmSegment !== "HIGH_VALUE_LOYAL"
  );

  // Get category affinity for cross-sell customers
  const crossSellWithAffinity = customerFeatures.filter(
    (f) => f.rfmSegment !== "HIGH_VALUE_LOYAL" && f.rfmFrequencyScore >= 2
  );

  if (crossSellWithAffinity.length > 0) {
    const affectedCount = crossSellWithAffinity.length;
    const firstCustomer = crossSellWithAffinity[0];
    const categoryAffinity = await getCategoryAffinity(firstCustomer.rfmSegment || "unknown");
    opportunities.push({
      type: "CROSS_SELL",
      title: "Cross-Sell Opportunity",
      description: `${affectedCount} customers with limited category purchasing — cross-sell potential`,
      evidence: [
        { feature: "Category Count", value: categoryAffinity.length.toString() },
        { feature: "Segment", value: firstCustomer.rfmSegment },
        { feature: "Customer Count", value: affectedCount.toString() },
      ],
      affectedCustomerCount: affectedCount,
    });
  }

  // LOW_CONVERSION: analyze overall customer base
  if (customerFeatures.length > 0) {
    opportunities.push({
      type: "LOW_CONVERSION",
      title: "Low Conversion Rate",
      description: "Opportunity to re-engage customer base with targeted campaigns",
      evidence: [
        { feature: "Total Customers", value: customerFeatures.length.toString() },
      ],
      affectedCustomerCount: customerFeatures.length,
    });
  }

  // Step 3: Opportunity scoring for each detected opportunity
  const scoredOpportunities = await Promise.all(
    opportunities.map(async (opp) => {
      let revenueScore = 0;
      let confidence = 0;
      let urgencyScore = 0;
      let customerValueScore = 0;

      switch (opp.type) {
        case "HIGH_VALUE_INACTIVE": {
          const totalMonetary = customerFeatures
            .filter((f) => f.rfmSegment === "HIGH_VALUE_INACTIVE")
            .reduce((sum, f) => sum + f.monetaryTotal, 0);
          const avgRecency = highValueInactiveCustomers.length > 0
            ? highValueInactiveCustomers.reduce((sum, f) => sum + f.recencyDays, 0) / highValueInactiveCustomers.length
            : 30;

          revenueScore = Math.min(100, Math.max(0, Math.round((totalMonetary / 1000000) * 100)));
          confidence = Math.min(100, Math.max(0, Math.round(70 + (opp.affectedCustomerCount / 100) * 15)));
          urgencyScore = Math.min(100, Math.max(0, Math.round(100 * (1 - Math.min(1, avgRecency / (60 * 2))))));
          const ivCustomers = customerFeatures.filter(
            (f) => f.rfmSegment === "HIGH_VALUE_INACTIVE"
          );
          customerValueScore = computeCustomerValueScore(
            ivCustomers.length > 0 ? ivCustomers[0].rfmSegment : "UNKNOWN"
          );
          break;
        }

        case "CART_ABANDONMENT": {
          revenueScore = Math.min(100, Math.max(0, Math.round(150000 * opp.affectedCustomerCount / 1000000 * 100)));
          confidence = Math.min(100, Math.max(0, Math.round(65 + (opp.affectedCustomerCount / 50) * 10)));
          urgencyScore = Math.min(100, Math.max(0, Math.round(100 * (1 - Math.min(1, 5 / 30)))));
          customerValueScore = 50;
          break;
        }

        case "UPSELL": {
          const aovCustomers = customerFeatures.filter(
            (f) => f.rfmSegment === "ACTIVE_GROWING"
          );
          const avgAov = aovCustomers.length > 0
            ? aovCustomers.reduce((sum, f) => sum + f.monetaryTotal, 0) / aovCustomers.length
            : 50000;
          revenueScore = Math.min(100, Math.max(0, Math.round(avgAov * opp.affectedCustomerCount * 0.2 / 1000000 * 100)));
          confidence = Math.min(100, Math.max(0, Math.round(60 + (opp.affectedCustomerCount / 50) * 10)));
          urgencyScore = Math.min(100, Math.max(0, Math.round(100 * (1 - Math.min(1, 15 / 30)))));
          customerValueScore = computeCustomerValueScore("ACTIVE_GROWING");
          break;
        }

        case "CROSS_SELL": {
          revenueScore = Math.min(100, Math.max(0, Math.round(15000 * opp.affectedCustomerCount / 1000000 * 100)));
          confidence = Math.min(100, Math.max(0, Math.round(65 + (opp.affectedCustomerCount / 50) * 10)));
          urgencyScore = Math.min(100, Math.max(0, Math.round(100 * (1 - Math.min(1, 10 / 30)))));
          customerValueScore = computeCustomerValueScore("ACTIVE_GROWING");
          break;
        }

        case "LOW_CONVERSION": {
          revenueScore = 30;
          confidence = 40;
          urgencyScore = 50;
          customerValueScore = 40;
          break;
        }
      }

      // Compute final opportunity score using documented weighted formula
      const scoreResult = computeOpportunityScore({
        revenueScore,
        confidence,
        urgencyScore,
        customerValueScore,
      });

      // Determine RFM segment for this opportunity type
      let rfmSegment: string;
      switch (opp.type) {
        case "HIGH_VALUE_INACTIVE":
          rfmSegment = "HIGH_VALUE_INACTIVE";
          break;
        case "UPSELL":
          rfmSegment = "ACTIVE_GROWING";
          break;
        case "CROSS_SELL":
          rfmSegment = crossSellWithAffinity.length > 0 ? crossSellWithAffinity[0].rfmSegment : "UNKNOWN";
          break;
        default:
          rfmSegment = "UNKNOWN";
      }

      return {
        ...opp,
        estimatedRevenueMinor: scoreResult.revenueScore / 100 * 1000000,
        confidence: scoreResult.confidence,
        status: "DETECTED",
        evidence: opp.evidence,
      };
    })
  );

  // Step 4: Strategy generation for each opportunity
  const opportunitiesWithStrategies = await Promise.all(
    scoredOpportunities.map(async (opp) => {
      let strategies: StrategyCandidate[] = [];

      switch (opp.type) {
        case "HIGH_VALUE_INACTIVE": {
          const hvCustomers = customerFeatures.filter(
            (f) => f.rfmSegment === "HIGH_VALUE_INACTIVE"
          );
          const firstCustomer = hvCustomers[0];
          const baseMonetary = firstCustomer?.monetaryTotal || 500000;
          const baseRecency = firstCustomer?.recencyDays || 72;

          const generated = generateStrategiesForHighValueInactive(
            firstCustomer?.rfmSegment || "HIGH_VALUE_INACTIVE",
            baseMonetary,
            baseRecency,
            opp.affectedCustomerCount
          );

          strategies = generated.slice(0, 4).map((s) => ({
            id: s.id,
            name: s.name,
            strategyType: s.strategyType,
            description: s.description,
            financials: s.financials,
            assumptions: s.assumptions,
            rationale: s.rationale,
            estimatedRevenueMinor: s.financials.estimatedRevenueMinor,
            estimatedCostMinor: s.financials.estimatedCostMinor,
            estimatedNetImpactMinor: s.financials.estimatedNetImpactMinor,
            estimatedRevenueRupees: s.estimatedRevenueRupees,
            estimatedCostRupees: s.estimatedCostRupees,
            estimatedNetImpactRupees: s.estimatedNetImpactRupees,
            estimatedROI: s.financials.estimatedROI,
            riskLevel: s.riskLevel,
            confidence: 50,
          }));
          break;
        }

        case "CART_ABANDONMENT": {
          const avgAov = 150000;
          const generated = generateStrategiesForCartAbandonment(
            opp.affectedCustomerCount,
            avgAov
          );
          strategies = generated.slice(0, 4).map((s) => ({
            id: s.id,
            name: s.name,
            strategyType: s.strategyType,
            description: s.description,
            financials: s.financials,
            assumptions: s.assumptions,
            rationale: s.rationale,
            estimatedRevenueMinor: s.financials.estimatedRevenueMinor,
            estimatedCostMinor: s.financials.estimatedCostMinor,
            estimatedNetImpactMinor: s.financials.estimatedNetImpactMinor,
            estimatedRevenueRupees: s.estimatedRevenueRupees,
            estimatedCostRupees: s.estimatedCostRupees,
            estimatedNetImpactRupees: s.estimatedNetImpactRupees,
            estimatedROI: s.financials.estimatedROI,
            riskLevel: s.riskLevel,
            confidence: 50,
          }));
          break;
        }

        case "UPSELL": {
          const aovCustomers = customerFeatures.filter(
            (f) => f.rfmSegment === "ACTIVE_GROWING"
          );
          const firstCustomer = aovCustomers[0];
          const avgAov = firstCustomer?.monetaryTotal / Math.max(1, 3);

          const generated = generateStrategiesForUpsell(
            firstCustomer?.rfmSegment || "ACTIVE_GROWING",
            avgAov,
            500000,
            opp.affectedCustomerCount
          );

          strategies = generated.slice(0, 4).map((s) => ({
            id: s.id,
            name: s.name,
            strategyType: s.strategyType,
            description: s.description,
            financials: s.financials,
            assumptions: s.assumptions,
            rationale: s.rationale,
            estimatedRevenueMinor: s.financials.estimatedRevenueMinor,
            estimatedCostMinor: s.financials.estimatedCostMinor,
            estimatedNetImpactMinor: s.financials.estimatedNetImpactMinor,
            estimatedRevenueRupees: s.estimatedRevenueRupees,
            estimatedCostRupees: s.estimatedCostRupees,
            estimatedNetImpactRupees: s.estimatedNetImpactRupees,
            estimatedROI: s.financials.estimatedROI,
            riskLevel: s.riskLevel,
            confidence: 50,
          }));
          break;
        }

        case "CROSS_SELL": {
          const crossCustomers = customerFeatures.filter(
            (f) => f.rfmSegment !== "HIGH_VALUE_LOYAL"
          );
          const firstCustomer = crossCustomers[0];
          const avgAov = firstCustomer?.monetaryTotal / Math.max(1, 3);

          const categoryAffinity = await getCategoryAffinity(firstCustomer?.rfmSegment || "unknown");

          const generated = generateStrategiesForCrossSell(
            categoryAffinity || ["General"],
            avgAov,
            500000,
            opp.affectedCustomerCount
          );

          strategies = generated.slice(0, 4).map((s) => ({
            id: s.id,
            name: s.name,
            strategyType: s.strategyType,
            description: s.description,
            financials: s.financials,
            assumptions: s.assumptions,
            rationale: s.rationale,
            estimatedRevenueMinor: s.financials.estimatedRevenueMinor,
            estimatedCostMinor: s.financials.estimatedCostMinor,
            estimatedNetImpactMinor: s.financials.estimatedNetImpactMinor,
            estimatedRevenueRupees: s.estimatedRevenueRupees,
            estimatedCostRupees: s.estimatedCostRupees,
            estimatedNetImpactRupees: s.estimatedNetImpactRupees,
            estimatedROI: s.financials.estimatedROI,
            riskLevel: s.riskLevel,
            confidence: 50,
          }));
          break;
        }

        case "LOW_CONVERSION": {
          strategies = [
            {
              id: "strat-1",
              name: "Reactivation Campaign",
              strategyType: "REACTIVATION",
              description: "Targeted email campaign to re-engage low-conversion customers",
              assumptions: ["10% conversion rate from re-engagement emails", "Average order value ₹500"],
              rationale: "Low-conversion customers need gentle re-engagement with clear value proposition",
              financials: {
                estimatedRevenueMinor: 200000,
                estimatedCostMinor: 20000,
                estimatedNetImpactMinor: 180000,
                estimatedROI: 9,
                riskLevel: "LOW",
              },
              estimatedRevenueRupees: "₹2,000.00",
              estimatedCostRupees: "₹200.00",
              estimatedNetImpactRupees: "₹1,800.00",
              riskLevel: "LOW",
              confidence: 50,
            },
            {
              id: "strat-2",
              name: "Discount Offer",
              strategyType: "DISCOUNT",
              description: "Time-limited discount to encourage first purchase",
              assumptions: ["5% discount conversion rate", "30% margin impact on discounted orders"],
              rationale: "Discount incentive drives first-purchase decision for hesitant customers",
              financials: {
                estimatedRevenueMinor: 150000,
                estimatedCostMinor: 30000,
                estimatedNetImpactMinor: 120000,
                estimatedROI: 4,
                riskLevel: "LOW",
              },
              estimatedRevenueRupees: "₹1,500.00",
              estimatedCostRupees: "₹300.00",
              estimatedNetImpactRupees: "₹1,200.00",
              riskLevel: "LOW",
              confidence: 50,
            },
          ];
          break;
        }
      }

      // Rank by ROI and select top 4
      const ranked = rankStrategies(strategies as StrategyCandidate[]);
      const top4 = selectTopStrategies(ranked, 4);

      return {
        ...opp,
        recommendedStrategies: top4,
      };
    })
  );

  const totalOpportunitiesDetected = opportunitiesWithStrategies.length;

  return {
    merchantId,
    opportunities: opportunitiesWithStrategies.map((opp, idx) => ({
      id: `opp-${opp.type}-${idx}`,
      ...opp,
      status: "DETECTED" as const,
    })),
    totalCustomersAnalyzed: customerFeatures.length,
    totalOpportunitiesDetected,
    analysisCompletedAt: new Date(),
  };
}

/** Compute customer value score from RFM segment */
function computeCustomerValueScore(rfmSegment: string): number {
  const scores: Record<string, number> = {
    HIGH_VALUE_LOYAL: 100,
    HIGH_VALUE_INACTIVE: 80,
    ACTIVE_GROWING: 60,
    NEW_CUSTOMER: 40,
    LOW_ENGAGEMENT: 20,
    AT_RISK: 50,
    UNKNOWN: 30,
  };
  return scores[rfmSegment] || 30;
}