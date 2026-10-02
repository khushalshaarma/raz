import { prisma } from "@/lib/prisma";
import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentType, AgentProposalData } from "../types";
import { validateAgentOutput, validateFinancialAmount } from "../validator";
import { storeShortTermMemory, buildAgentOutputKey } from "../memory/short-term";

export const opportunityAgent: Agent = {
  agentType: "OPPORTUNITY",
  name: "Opportunity Agent",
  description: "Detects growth opportunities from merchant data",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { merchantId } = input;

    const customers = await prisma.customer.findMany({
      where: { merchantId },
      include: { orders: { where: { status: "COMPLETED" } } },
    });

    const proposals: AgentProposalData[] = [];
    const evidence: string[] = [];

    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const sixtyDays = 60 * 24 * 60 * 60 * 1000;

    const inactiveCustomers = customers.filter((c) => {
      const lastOrder = c.orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!lastOrder) return false;
      const daysSince = now - lastOrder.createdAt.getTime();
      return daysSince > thirtyDays && daysSince < sixtyDays;
    });

    const highValueInactive = inactiveCustomers.filter((c) => {
      const totalSpend = c.orders.reduce((sum, o) => sum + o.totalMinor, 0);
      return totalSpend > 50000; // ₹500
    });

    if (highValueInactive.length > 0) {
      const totalRevenueAtRisk = highValueInactive.reduce((sum, c) => {
        const avgOrderValue = c.orders.reduce((s, o) => s + o.totalMinor, 0) / c.orders.length;
        return sum + avgOrderValue;
      }, 0);

      proposals.push({
        proposalType: "INACTIVE_CUSTOMERS",
        title: `Reactivate ${highValueInactive.length} inactive high-value customers`,
        description: `${highValueInactive.length} customers who spent ₹${Math.round(totalRevenueAtRisk / 100)} have not purchased in 30-60 days`,
        confidence: 75,
        riskLevel: "LOW",
        financialImpact: { amountMinor: totalRevenueAtRisk, currency: "INR" },
        evidence: [`Found ${highValueInactive.length} inactive high-value customers`],
      });

      evidence.push(`Inactive high-value customers: ${highValueInactive.length}`);
    }

    const newCustomers = customers.filter((c) => {
      const daysSinceCreation = now - c.createdAt.getTime();
      return daysSinceCreation < 30 && c.orders.length <= 1;
    });

    if (newCustomers.length > 5) {
      proposals.push({
        proposalType: "NEW_CUSTOMER_NURTURE",
        title: `Nurture ${newCustomers.length} new customers`,
        description: `${newCustomers.length} customers joined in the last 30 days with 0-1 orders. Upsell opportunity.`,
        confidence: 60,
        riskLevel: "LOW",
        financialImpact: { amountMinor: newCustomers.length * 15000, currency: "INR" },
        evidence: [`Found ${newCustomers.length} new customers`],
      });
    }

    const allCustomersWithOrders = customers.filter((c) => c.orders.length >= 2);
    if (allCustomersWithOrders.length > 0) {
      const topCategories = new Map<string, number>();
      for (const customer of allCustomersWithOrders) {
        for (const order of customer.orders) {
          const items = await prisma.orderItem.findMany({
            where: { orderId: order.id },
            include: { product: true },
          });
          for (const item of items) {
            const cat = item.product.category;
            topCategories.set(cat, (topCategories.get(cat) ?? 0) + item.totalMinor);
          }
        }
      }

      const sortedCategories = Array.from(topCategories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (sortedCategories.length >= 2) {
        proposals.push({
          proposalType: "CROSS_SELL",
          title: `Cross-sell ${sortedCategories.length} category bundles`,
          description: `Customers with multi-category affinity detected across ${sortedCategories.map((c) => c[0]).join(", ")}`,
          confidence: 65,
          riskLevel: "LOW",
          financialImpact: { amountMinor: allCustomersWithOrders.length * 10000, currency: "INR" },
          evidence: [`Category affinity detected: ${sortedCategories.map((c) => `${c[0]}: ₹${Math.round(c[1] / 100)}`).join(", ")}`],
        });
      }
    }

    const confidence = proposals.length > 0
      ? Math.min(proposals.reduce((sum, p) => sum + p.confidence, 0) / proposals.length + 10, 95)
      : 40;

    const output: AgentOutput = {
      agentType: "OPPORTUNITY",
      agentRunId: input.agentRunId ?? "",
      status: "COMPLETED",
      confidence,
      reasoningSummary: proposals.length > 0
        ? `Detected ${proposals.length} opportunities from ${customers.length} customers`
        : `No significant opportunities detected from ${customers.length} customers`,
      evidence,
      proposals,
      warnings: [],
      outputData: { customerCount: customers.length, proposalCount: proposals.length },
      createdAt: new Date(),
    };

    if (context.growthCycleId) {
      await storeShortTermMemory(
        merchantId,
        "STRATEGY_PERFORMANCE",
        buildAgentOutputKey("OPPORTUNITY", context.growthCycleId),
        { proposalCount: proposals.length, confidence }
      );
    }

    return output;
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
