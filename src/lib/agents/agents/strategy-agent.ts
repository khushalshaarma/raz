import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput, validateFinancialAmount } from "../validator";

interface StrategyCandidate {
  strategyType: string;
  name: string;
  description: string;
  estimatedRevenueMinor: number;
  estimatedCostMinor: number;
  estimatedNetImpactMinor: number;
  estimatedROI: number;
  confidence: number;
  riskLevel: string;
  assumptions: string[];
}

function generateStrategies(proposalType: string): StrategyCandidate[] {
  const baseStrategies: Record<string, StrategyCandidate[]> = {
    INACTIVE_CUSTOMERS: [
      {
        strategyType: "REACTIVATION",
        name: "15% Discount Re-engagement",
        description: "Offer 15% discount to inactive high-value customers",
        estimatedRevenueMinor: 45000,
        estimatedCostMinor: 6750,
        estimatedNetImpactMinor: 38250,
        estimatedROI: 5.67,
        confidence: 72,
        riskLevel: "LOW",
        assumptions: ["30% redemption rate", "Average order value ₹300", "One-time discount"],
      },
      {
        strategyType: "REACTIVATION",
        name: "Personalized Win-back Email",
        description: "Send personalized email with product recommendations",
        estimatedRevenueMinor: 30000,
        estimatedCostMinor: 2000,
        estimatedNetImpactMinor: 28000,
        estimatedROI: 14.0,
        confidence: 65,
        riskLevel: "LOW",
        assumptions: ["15% conversion rate", "Email open rate 40%", "No discount cost"],
      },
    ],
    NEW_CUSTOMER_NURTURE: [
      {
        strategyType: "UPSELL",
        name: "Welcome Bundle Offer",
        description: "Offer curated bundle at 10% discount for first repeat purchase",
        estimatedRevenueMinor: 25000,
        estimatedCostMinor: 2500,
        estimatedNetImpactMinor: 22500,
        estimatedROI: 9.0,
        confidence: 60,
        riskLevel: "LOW",
        assumptions: ["20% conversion", "Bundle AOV ₹250", "Repeat within 14 days"],
      },
    ],
    CROSS_SELL: [
      {
        strategyType: "CROSS_SELL",
        name: "Category Bundle Offer",
        description: "Bundle products from complementary categories at 12% discount",
        estimatedRevenueMinor: 50000,
        estimatedCostMinor: 6000,
        estimatedNetImpactMinor: 44000,
        estimatedROI: 7.33,
        confidence: 62,
        riskLevel: "LOW",
        assumptions: ["25% cross-sell acceptance", "Bundle AOV ₹500", "Complementary categories"],
      },
    ],
  };

  return baseStrategies[proposalType] ?? [
    {
      strategyType: "PERSONALIZED_OFFER",
      name: "Personalized Discount Offer",
      description: "Offer personalized discount based on customer behavior",
      estimatedRevenueMinor: 20000,
      estimatedCostMinor: 3000,
      estimatedNetImpactMinor: 17000,
      estimatedROI: 5.67,
      confidence: 55,
      riskLevel: "MEDIUM",
      assumptions: ["15% redemption", "Average order ₹200", "Behavior-based targeting"],
    },
  ];
}

export const strategyAgent: Agent = {
  agentType: "STRATEGY",
  name: "Strategy Agent",
  description: "Generates strategy candidates for detected opportunities",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { data } = input;
    const proposals: AgentProposalData[] = [];
    const evidence: string[] = [];

    const opportunityProposals = (data.proposals as Array<{
      proposalType: string;
      title: string;
      confidence: number;
      financialImpact?: { amountMinor: number; currency: string };
    }>) ?? [];

    let totalStrategies = 0;

    for (const opp of opportunityProposals) {
      const strategies = generateStrategies(opp.proposalType);

      for (const strategy of strategies) {
        if (!validateFinancialAmount(strategy.estimatedRevenueMinor)) {
          evidence.push(`Invalid revenue for ${strategy.name}`);
          continue;
        }
        if (!validateFinancialAmount(strategy.estimatedCostMinor)) {
          evidence.push(`Invalid cost for ${strategy.name}`);
          continue;
        }

        proposals.push({
          proposalType: strategy.strategyType,
          title: strategy.name,
          description: strategy.description,
          confidence: strategy.confidence,
          riskLevel: strategy.riskLevel,
          financialImpact: {
            amountMinor: strategy.estimatedNetImpactMinor,
            currency: "INR",
          },
          evidence: strategy.assumptions,
        });
        totalStrategies++;
      }
    }

    const confidence = proposals.length > 0
      ? Math.round(proposals.reduce((sum, p) => sum + p.confidence, 0) / proposals.length)
      : 30;

    return {
      agentType: "STRATEGY",
      agentRunId: input.agentRunId ?? "",
      status: "COMPLETED",
      confidence,
      reasoningSummary: `Generated ${totalStrategies} strategy candidates from ${opportunityProposals.length} opportunities`,
      evidence,
      proposals,
      warnings: totalStrategies === 0 ? ["No strategies generated"] : [],
      outputData: { strategyCount: totalStrategies, opportunityCount: opportunityProposals.length },
      createdAt: new Date(),
    };
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
