import { prisma } from "@/lib/prisma";
import type { AutopilotMode, MerchantAgentConfig } from "./types";

export async function getAutopilotConfig(merchantId: string): Promise<{
  mode: AutopilotMode;
  config: MerchantAgentConfig;
  isActive: boolean;
} | null> {
  const record = await prisma.autopilotConfig.findUnique({
    where: { merchantId },
  });

  if (!record) {
    return {
      mode: "OFF",
      config: getDefaultConfig(),
      isActive: false,
    };
  }

  return {
    mode: record.mode as AutopilotMode,
    config: {
      maxDailySpendMinor: record.maxDailySpendMinor,
      maxCampaignSpendMinor: record.maxCampaignSpendMinor,
      maxCustomerSpendMinor: record.maxCustomerSpendMinor,
      maxActionsPerHour: record.maxActionsPerHour,
      maxActionsPerDay: record.maxActionsPerDay,
      minimumConfidence: record.minimumConfidence,
      maximumRisk: record.maximumRisk,
      approvalRequiredAboveMinor: record.approvalRequiredAboveMinor,
    },
    isActive: record.isActive,
  };
}

export async function updateAutopilotConfig(
  merchantId: string,
  updates: {
    mode?: AutopilotMode;
    maxDailySpendMinor?: number;
    maxCampaignSpendMinor?: number;
    maxCustomerSpendMinor?: number;
    maxActionsPerHour?: number;
    maxActionsPerDay?: number;
    minimumConfidence?: number;
    maximumRisk?: number;
    approvalRequiredAboveMinor?: number;
    isActive?: boolean;
  }
): Promise<void> {
  const existing = await prisma.autopilotConfig.findUnique({
    where: { merchantId },
  });

  if (existing) {
    await prisma.autopilotConfig.update({
      where: { merchantId },
      data: updates,
    });
  } else {
    await prisma.autopilotConfig.create({
      data: {
        merchantId,
        ...getDefaultConfig(),
        ...updates,
      },
    });
  }
}

export async function stopAutopilot(merchantId: string): Promise<void> {
  await updateAutopilotConfig(merchantId, { mode: "OFF", isActive: false });
}

export async function isAutopilotActive(merchantId: string): Promise<boolean> {
  const config = await getAutopilotConfig(merchantId);
  return config?.mode !== "OFF" && config?.isActive === true;
}

export async function checkAutopilotLimits(
  merchantId: string,
  proposedSpendMinor: number
): Promise<{
  allowed: boolean;
  reason?: string;
  limits: {
    dailySpendRemaining: number;
    actionsRemaining: number;
  };
}> {
  const config = await getAutopilotConfig(merchantId);
  if (!config || config.mode === "OFF") {
    return { allowed: false, reason: "Autopilot is OFF", limits: { dailySpendRemaining: 0, actionsRemaining: 0 } };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todaySpend = await prisma.execution.aggregate({
    where: {
      merchantId,
      status: { in: ["SUCCEEDED", "SUBMITTED", "PENDING"] },
      createdAt: { gte: todayStart },
    },
    _sum: { amountMinor: true },
  });
  const dailySpend = todaySpend._sum.amountMinor ?? 0;

  const todayActions = await prisma.execution.count({
    where: {
      merchantId,
      createdAt: { gte: todayStart },
    },
  });

  const dailySpendRemaining = config.config.maxDailySpendMinor - dailySpend;
  const actionsRemaining = config.config.maxActionsPerDay - todayActions;

  if (proposedSpendMinor > dailySpendRemaining) {
    return {
      allowed: false,
      reason: `Daily spend limit exceeded: ₹${Math.round((dailySpend + proposedSpendMinor) / 100)} > ₹${Math.round(config.config.maxDailySpendMinor / 100)}`,
      limits: { dailySpendRemaining, actionsRemaining },
    };
  }

  if (actionsRemaining <= 0) {
    return {
      allowed: false,
      reason: `Daily action limit reached: ${todayActions}/${config.config.maxActionsPerDay}`,
      limits: { dailySpendRemaining, actionsRemaining },
    };
  }

  return {
    allowed: true,
    limits: { dailySpendRemaining, actionsRemaining },
  };
}

function getDefaultConfig(): MerchantAgentConfig {
  return {
    maxDailySpendMinor: 1000000,
    maxCampaignSpendMinor: 500000,
    maxCustomerSpendMinor: 20000,
    maxActionsPerHour: 10,
    maxActionsPerDay: 50,
    minimumConfidence: 70,
    maximumRisk: 40,
    approvalRequiredAboveMinor: 10000,
  };
}
