/**
 * Strategy generator: produces multiple strategy candidates per opportunity type
 * All financial fields are deterministic and documented
 * No LLM-driven financial calculation — all from documented formulas
 *
 * Strategy Types (Step 12 of Phase 2 architecture):
 * - DISCOUNT: percentage discount on selected products
 * - REACTIVATION: targeted re-engagement campaign
 * - UPSELL: upgrade to premium product/plan
 * - CROSS_SELL: complementary product recommendation
 * - BUNDLE: product bundle at special price
 * - PERSONALIZED_OFFER: custom offer based on segment
 *
 * Each strategy has documented assumptions and financial impact.
 */

import { formatMoney } from "@/lib/product/format";
export { formatMoney };

/** Strategy type enum */
export type StrategyType =
  | "DISCOUNT"
  | "REACTIVATION"
  | "UPSELL"
  | "CROSS_SELL"
  | "BUNDLE"
  | "PERSONALIZED_OFFER";

/** Financial fields for a strategy - all in paise (integer) */
export interface StrategyFinancials {
  estimatedRevenueMinor: number;   // estimated revenue impact in paise
  estimatedCostMinor: number;      // estimated cost in paise
  estimatedNetImpactMinor: number; // revenue - cost
  estimatedROI: number;            // net / cost (0 if cost <= 0)
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

/** Full strategy candidate */
export interface StrategyCandidate {
  id: string;
  strategyType: StrategyType;
  name: string;
  description: string;
  financials: StrategyFinancials;
  assumptions: string[];
  rationale: string;
  estimatedRevenueRupees: string; // formatted for display
  estimatedCostRupees: string;    // formatted for display
  estimatedNetImpactRupees: string; // formatted for display
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  confidence: number; // 0-100
}

/**
 * Generate strategy candidates for a HIGH_VALUE_INACTIVE opportunity
 * 2-4 candidates with different approaches
 */
export function generateStrategiesForHighValueInactive(
  rfmSegment: string,
  monetaryTotal: number,
  recencyDays: number,
  affectedCustomerCount: number
): StrategyCandidate[] {
  const strategies: StrategyCandidate[] = [];

  // Candidate 1: Discount re-engagement
  const discountRevenue = Math.round(monetaryTotal * 0.15); // 15% of spend
  const discountCost = Math.round(monetaryTotal * 0.15 * 0.5); // 50% of discount as cost
  strategies.push({
    id: "strategy-1",
    strategyType: "DISCOUNT",
    name: "15% Discount Re-Engagement",
    description: "Targeted 15% discount on top 3 preferred categories to win back inactive high-value customers",
    financials: {
      estimatedRevenueMinor: discountRevenue,
      estimatedCostMinor: discountCost,
      estimatedNetImpactMinor: discountRevenue - discountCost,
      estimatedROI: discountCost > 0 ? Math.round(((discountRevenue - discountCost) / discountCost) * 100) / 100 : 0,
      riskLevel: "LOW",
    },
    assumptions: [
      "15% discount is sufficient to trigger repeat purchase",
      "10% of targeted customers will convert within 60 days",
      "Margin loss on discounted items is within acceptable range",
    ],
    rationale: `${affectedCustomerCount} high-value inactive customers; 15% discount targets their typical basket size; expected to recover ~10% of at-risk revenue`,
    estimatedRevenueRupees: formatMoney(discountRevenue),
    estimatedCostRupees: formatMoney(discountCost),
    estimatedNetImpactRupees: formatMoney(discountRevenue - discountCost),
    riskLevel: "LOW",
    confidence: 75,
  });

  // Candidate 2: Reactivation email campaign
  const reactivationRevenue = Math.round(monetaryTotal * 0.10);
  const reactivationCost = Math.round(20000); // fixed campaign cost
  strategies.push({
    id: "strategy-2",
    strategyType: "REACTIVATION",
    name: "Reactivation Email Campaign",
    description: "Personalized re-engagement email series with 'we miss you' messaging and 10% incentive",
    financials: {
      estimatedRevenueMinor: reactivationRevenue,
      estimatedCostMinor: reactivationCost,
      estimatedNetImpactMinor: reactivationRevenue - reactivationCost,
      estimatedROI: reactivationCost > 0 ? Math.round(((reactivationRevenue - reactivationCost) / reactivationCost) * 100) / 100 : 0,
      riskLevel: "MEDIUM",
    },
    assumptions: [
      "Email open rate of 40% for inactive customers",
      "Conversion rate of 5% from re-engagement emails",
      "10% incentive is sufficient without eroding brand value",
    ],
    rationale: `${affectedCustomerCount} high-value inactive customers; email campaign with 10% incentive; lower cost than discount but slower conversion`,
    estimatedRevenueRupees: formatMoney(reactivationRevenue),
    estimatedCostRupees: formatMoney(reactivationCost),
    estimatedNetImpactRupees: formatMoney(reactivationRevenue - reactivationCost),
    riskLevel: "MEDIUM",
    confidence: 65,
  });

  // Candidate 3: Upsell to premium category
  const upsellRevenue = Math.round(monetaryTotal * 0.25);
  const upsellCost = Math.round(monetaryTotal * 0.25 * 0.3); // 30% of upsell as cost
  strategies.push({
    id: "strategy-3",
    strategyType: "UPSELL",
    name: "Premium Category Upsell",
    description: "Upgrade inactive customers to premium category with enhanced value proposition",
    financials: {
      estimatedRevenueMinor: upsellRevenue,
      estimatedCostMinor: upsellCost,
      estimatedNetImpactMinor: upsellRevenue - upsellCost,
      estimatedROI: upsellCost > 0 ? Math.round(((upsellRevenue - upsellCost) / upsellCost) * 100) / 100 : 0,
      riskLevel: "MEDIUM",
    },
    assumptions: [
      "Customers have shown preference for premium categories in history",
      "25% of customers will upgrade given proper positioning",
      "Higher margin on premium products offsets discount equivalent",
    ],
    rationale: `Premium category upsell for ${affectedCustomerCount} customers; 25% upgrade rate expected; higher AOV per converted customer`,
    estimatedRevenueRupees: formatMoney(upsellRevenue),
    estimatedCostRupees: formatMoney(upsellCost),
    estimatedNetImpactRupees: formatMoney(upsellRevenue - upsellCost),
    riskLevel: "MEDIUM",
    confidence: 60,
  });

  // Candidate 4: Bundle offer (if 4th candidate slot)
  if (strategies.length < 4) {
    const bundleRevenue = Math.round(monetaryTotal * 0.18);
    const bundleCost = Math.round(monetaryTotal * 0.18 * 0.4);
    strategies.push({
      id: "strategy-4",
      strategyType: "BUNDLE",
      name: "Preferred Category Bundle",
      description: "Bundle top 3 preferred products at 10% discount — perceived value > individual prices",
      financials: {
        estimatedRevenueMinor: bundleRevenue,
        estimatedCostMinor: bundleCost,
        estimatedNetImpactMinor: bundleRevenue - bundleCost,
        estimatedROI: bundleCost > 0 ? Math.round(((bundleRevenue - bundleCost) / bundleCost) * 100) / 100 : 0,
        riskLevel: "LOW",
      },
      assumptions: [
        "Bundle of 3 preferred products increases perceived value",
        "10% bundle discount is attractive without eroding margin",
        "30% of customers who didn't buy individually will buy a bundle",
      ],
      rationale: `Bundle offer for ${affectedCustomerCount} customers; 30% conversion on bundle; bundle perceived value 20% above individual prices`,
      estimatedRevenueRupees: formatMoney(bundleRevenue),
      estimatedCostRupees: formatMoney(bundleCost),
      estimatedNetImpactRupees: formatMoney(bundleRevenue - bundleCost),
      riskLevel: "LOW",
      confidence: 70,
    });
  }

  return strategies;
}

/**
 * Generate strategy candidates for a CART_ABANDONMENT opportunity
 */
export function generateStrategiesForCartAbandonment(
  affectedCustomerCount: number,
  avgOrderValue: number
): StrategyCandidate[] {
  const strategies: StrategyCandidate[] = [];

  // Candidate 1: Discount on abandoned cart
  const discountRevenue = Math.round(affectedCustomerCount * avgOrderValue * 0.25); // 25% convert at 10% discount
  const discountCost = Math.round(discountRevenue * 0.4); // 40% of revenue as cost
  strategies.push({
    id: "strategy-1",
    strategyType: "DISCOUNT",
    name: "10% Cart Abandonment Discount",
    description: "One-time 10% discount code sent to cart abandoners to complete purchase",
    financials: {
      estimatedRevenueMinor: discountRevenue,
      estimatedCostMinor: discountCost,
      estimatedNetImpactMinor: discountRevenue - discountCost,
      estimatedROI: discountCost > 0 ? Math.round(((discountRevenue - discountCost) / discountCost) * 100) / 100 : 0,
      riskLevel: "LOW",
    },
    assumptions: [
      "10% discount is the optimal threshold for cart conversion",
      "25% of cart abandoners will complete with incentive",
      "Discount cost is offset by increased lifetime value",
    ],
    rationale: `${affectedCustomerCount} cart abandoners; 10% discount expected to convert 25%; quick implementation`,
    estimatedRevenueRupees: formatMoney(discountRevenue),
    estimatedCostRupees: formatMoney(discountCost),
    estimatedNetImpactRupees: formatMoney(discountRevenue - discountCost),
    riskLevel: "LOW",
    confidence: 80,
  });

  // Candidate 2: Email reminder only (no discount)
  const reminderRevenue = Math.round(affectedCustomerCount * avgOrderValue * 0.15);
  const reminderCost = Math.round(5000); // fixed email cost
  strategies.push({
    id: "strategy-2",
    strategyType: "REACTIVATION",
    name: "Cart Abandonment Reminder",
    description: "2-email reminder sequence without discount — leverage urgency and social proof",
    financials: {
      estimatedRevenueMinor: reminderRevenue,
      estimatedCostMinor: reminderCost,
      estimatedNetImpactMinor: reminderRevenue - reminderCost,
      estimatedROI: reminderCost > 0 ? Math.round(((reminderRevenue - reminderCost) / reminderCost) * 100) / 100 : 0,
      riskLevel: "LOW",
    },
    assumptions: [
      "Reminder open rate of 50%",
      "10% conversion from reminder without discount",
      "No margin loss from discounts",
    ],
    rationale: `${affectedCustomerCount} cart abandoners; reminder-only approach preserves margin; slower but cost-free`,
    estimatedRevenueRupees: formatMoney(reminderRevenue),
    estimatedCostRupees: formatMoney(reminderCost),
    estimatedNetImpactRupees: formatMoney(reminderRevenue - reminderCost),
    riskLevel: "LOW",
    confidence: 70,
  });

  // Candidate 3: Express shipping incentive
  if (strategies.length < 3) {
    const shippingRevenue = Math.round(affectedCustomerCount * avgOrderValue * 0.18);
    const shippingCost = Math.round(affectedCustomerCount * 2000); // shipping subsidy
    strategies.push({
      id: "strategy-3",
      strategyType: "DISCOUNT",
      name: "Express Shipping Incentive",
      description: "Free express shipping on orders completed within 48 hours",
      financials: {
        estimatedRevenueMinor: shippingRevenue,
        estimatedCostMinor: shippingCost,
        estimatedNetImpactMinor: shippingRevenue - shippingCost,
        estimatedROI: shippingCost > 0 ? Math.round(((shippingRevenue - shippingCost) / shippingCost) * 100) / 100 : 0,
        riskLevel: "MEDIUM",
      },
      assumptions: [
        "Free shipping is a stronger motivator than percentage discount",
        "48-hour window creates urgency",
        "20% of abandoners will convert for free shipping",
      ],
      rationale: `${affectedCustomerCount} cart abandoners; free express shipping incentive; 20% conversion expected; shipping cost limited to 48hr window`,
      estimatedRevenueRupees: formatMoney(shippingRevenue),
      estimatedCostRupees: formatMoney(shippingCost),
      estimatedNetImpactRupees: formatMoney(shippingRevenue - shippingCost),
      riskLevel: "MEDIUM",
      confidence: 65,
    });
  }

  return strategies;
}

/**
 * Generate strategy candidates for an UPSELL opportunity
 */
export function generateStrategiesForUpsell(
  rfmSegment: string,
  averageOrderValue: number,
  monetaryTotal: number,
  affectedCustomerCount: number
): StrategyCandidate[] {
  const strategies: StrategyCandidate[] = [];

  // Candidate 1: 20% upgrade offer
  const upsellRevenue = Math.round(monetaryTotal * 0.20);
  const upsellCost = Math.round(monetaryTotal * 0.20 * 0.35);
  strategies.push({
    id: "strategy-1",
    strategyType: "UPSELL",
    name: "20% Premium Upgrade Offer",
    description: "Offer 20% discount on premium product upgrade for high-value customers",
    financials: {
      estimatedRevenueMinor: upsellRevenue,
      estimatedCostMinor: upsellCost,
      estimatedNetImpactMinor: upsellRevenue - upsellCost,
      estimatedROI: upsellCost > 0 ? Math.round(((upsellRevenue - upsellCost) / upsellCost) * 100) / 100 : 0,
      riskLevel: "MEDIUM",
    },
    assumptions: [
      "20% discount is optimal for upgrade conversion",
      "RFM segment " + rfmSegment + " responds well to upgrade offers",
      "30% of customers will upgrade within 30 days",
    ],
    rationale: `${affectedCustomerCount} customers with AOV ₹${formatMoney(averageOrderValue)}; 20% upgrade offer targeting premium category; expected 30% conversion`,
    estimatedRevenueRupees: formatMoney(upsellRevenue),
    estimatedCostRupees: formatMoney(upsellCost),
    estimatedNetImpactRupees: formatMoney(upsellRevenue - upsellCost),
    riskLevel: "MEDIUM",
    confidence: 65,
  });

  // Candidate 2: 30% premium upgrade (higher discount, higher reward)
  if (strategies.length < 2) {
    const highUpsellRevenue = Math.round(monetaryTotal * 0.30);
    const highUpsellCost = Math.round(monetaryTotal * 0.30 * 0.45);
    strategies.push({
      id: "strategy-2",
      strategyType: "UPSELL",
      name: "30% Premium Upgrade",
      description: "Higher 30% discount on premium upgrade for customers near upgrade threshold",
      financials: {
        estimatedRevenueMinor: highUpsellRevenue,
        estimatedCostMinor: highUpsellCost,
        estimatedNetImpactMinor: highUpsellRevenue - highUpsellCost,
        estimatedROI: highUpsellCost > 0 ? Math.round(((highUpsellRevenue - highUpsellCost) / highUpsellCost) * 100) / 100 : 0,
        riskLevel: "HIGH",
      },
      assumptions: [
        "30% discount significantly increases upgrade probability",
        "Higher margin loss but higher conversion rate expected (40%)",
        "Best for customers with 2+ prior orders",
      ],
      rationale: `30% upgrade offer for ${affectedCustomerCount} customers; 40% conversion expected; higher cost but higher reward`,
      estimatedRevenueRupees: formatMoney(highUpsellRevenue),
      estimatedCostRupees: formatMoney(highUpsellCost),
      estimatedNetImpactRupees: formatMoney(highUpsellRevenue - highUpsellCost),
      riskLevel: "HIGH",
      confidence: 55,
    });
  }

  // Candidate 3: Personalized offer based on purchase history
  if (strategies.length < 3) {
    const personalRevenue = Math.round(monetaryTotal * 0.15);
    const personalCost = Math.round(personalRevenue * 0.2);
    strategies.push({
      id: "strategy-3",
      strategyType: "PERSONALIZED_OFFER",
      name: "Personalized Product Recommendation",
      description: "Curated product recommendations based on purchase history with 15% introductory discount",
      financials: {
        estimatedRevenueMinor: personalRevenue,
        estimatedCostMinor: personalCost,
        estimatedNetImpactMinor: personalRevenue - personalCost,
        estimatedROI: personalCost > 0 ? Math.round(((personalRevenue - personalCost) / personalCost) * 100) / 100 : 0,
        riskLevel: "LOW",
      },
      assumptions: [
        "Personalization increases relevance and conversion",
        "15% discount is introductory, not permanent",
        "30% of customers will respond to personalized recommendations",
      ],
      rationale: `Personalized recommendations for ${affectedCustomerCount} customers; 30% conversion on curated offers; 15% discount is targeted and temporary`,
      estimatedRevenueRupees: formatMoney(personalRevenue),
      estimatedCostRupees: formatMoney(personalCost),
      estimatedNetImpactRupees: formatMoney(personalRevenue - personalCost),
      riskLevel: "LOW",
      confidence: 70,
    });
  }

  return strategies;
}

/**
 * Generate strategy candidates for a CROSS_SELL opportunity
 */
export function generateStrategiesForCrossSell(
  categoryAffinity: string[],
  averageOrderValue: number,
  monetaryTotal: number,
  affectedCustomerCount: number
): StrategyCandidate[] {
  const strategies: StrategyCandidate[] = [];

  // Candidate 1: Cross-sell within top category
  const topCategory = categoryAffinity[0] || "Accessories";
  const crossSellRevenue = Math.round(monetaryTotal * 0.12);
  const crossSellCost = Math.round(crossSellRevenue * 0.3);
  strategies.push({
    id: "strategy-1",
    strategyType: "CROSS_SELL",
    name: "Cross-Sell in " + topCategory,
    description: "Recommend " + topCategory + " products to customers who typically buy from this category — 12% of spend expected as cross-sell revenue",
    financials: {
      estimatedRevenueMinor: crossSellRevenue,
      estimatedCostMinor: crossSellCost,
      estimatedNetImpactMinor: crossSellRevenue - crossSellCost,
      estimatedROI: crossSellCost > 0 ? Math.round(((crossSellRevenue - crossSellCost) / crossSellCost) * 100) / 100 : 0,
      riskLevel: "LOW",
    },
    assumptions: [
      "Customers already interested in " + topCategory + " are likely to add complementary items",
      "12% cross-sell rate from targeted recommendations",
      "Low cost as recommendations are digital/systems-driven",
    ],
    rationale: `${affectedCustomerCount} customers in ${topCategory} category; 12% cross-sell rate; system-driven recommendations, minimal cost`,
    estimatedRevenueRupees: formatMoney(crossSellRevenue),
    estimatedCostRupees: formatMoney(crossSellCost),
    estimatedNetImpactRupees: formatMoney(crossSellRevenue - crossSellCost),
    riskLevel: "LOW",
    confidence: 75,
  });

  // Candidate 2: Bundle with complementary category
  if (categoryAffinity.length >= 2) {
    const secondCategory = categoryAffinity[1];
    const bundleRevenue = Math.round(monetaryTotal * 0.15);
    const bundleCost = Math.round(bundleRevenue * 0.35);
    strategies.push({
      id: "strategy-2",
      strategyType: "BUNDLE",
      name: topCategory + "+" + secondCategory + " Bundle",
      description: "Bundle " + topCategory + " and " + secondCategory + " products at special price — 15% of spend as bundle revenue",
      financials: {
        estimatedRevenueMinor: bundleRevenue,
        estimatedCostMinor: bundleCost,
        estimatedNetImpactMinor: bundleRevenue - bundleCost,
        estimatedROI: bundleCost > 0 ? Math.round(((bundleRevenue - bundleCost) / bundleCost) * 100) / 100 : 0,
        riskLevel: "LOW",
      },
      assumptions: [
        "Bundling complementary categories increases average order value",
        "15% bundle adoption rate from targeted customers",
        "Perceived value exceeds individual product prices",
      ],
      rationale: `${affectedCustomerCount} customers with ${topCategory}+${secondCategory} affinity; 15% bundle adoption; minimal system cost`,
      estimatedRevenueRupees: formatMoney(bundleRevenue),
      estimatedCostRupees: formatMoney(bundleCost),
      estimatedNetImpactRupees: formatMoney(bundleRevenue - bundleCost),
      riskLevel: "LOW",
      confidence: 70,
    });
  }

  // Candidate 3: Personalized cross-sell offer
  if (strategies.length < 3) {
    const personalRevenue = Math.round(monetaryTotal * 0.08);
    const personalCost = Math.round(personalRevenue * 0.2);
    strategies.push({
      id: "strategy-3",
      strategyType: "PERSONALIZED_OFFER",
      name: "Personalized Cross-Sell Offer",
      description: "AI-curated complementary product recommendations with 8% expected revenue",
      financials: {
        estimatedRevenueMinor: personalRevenue,
        estimatedCostMinor: personalCost,
        estimatedNetImpactMinor: personalRevenue - personalCost,
        estimatedROI: personalCost > 0 ? Math.round(((personalRevenue - personalCost) / personalCost) * 100) / 100 : 0,
        riskLevel: "LOW",
      },
      assumptions: [
        "Personalized recommendations are 2x more effective than generic",
        "8% cross-sell rate from personalized suggestions",
        "Low cost as recommendations are systems-driven",
      ],
      rationale: `${affectedCustomerCount} customers; personalized cross-sell 2x effective; low cost, systems-driven`,
      estimatedRevenueRupees: formatMoney(personalRevenue),
      estimatedCostRupees: formatMoney(personalCost),
      estimatedNetImpactRupees: formatMoney(personalRevenue - personalCost),
      riskLevel: "LOW",
      confidence: 70,
    });
  }

  return strategies;
}
