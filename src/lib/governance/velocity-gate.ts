import { prisma } from "@/lib/prisma";

export interface VelocityGateResult {
  decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  currentCount: number;
  limit: number;
  period: string;
  windowStart: Date;
  policyId: string | null;
  reasonCode: string;
  explanation: string;
}

export interface VelocityGateInput {
  currentCount: number;
  policyId?: string;
  period: "minute" | "hour" | "day";
  merchantId?: string;
}

export async function evaluateVelocityGate(
  input: VelocityGateInput
): Promise<VelocityGateResult> {
  const { currentCount, policyId: policyIdInput, period, merchantId } = input;

  let limit = 100;
  const defaultLimitByPeriod: Record<string, number> = { minute: 5, hour: 20, day: 100 };

  if (policyIdInput) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const policy = await prisma.policy.findUnique({ where: { id: policyIdInput } });
      if (policy && policy.isActive && policy.conditionType === "VELOCITY") {
        limit = policy.conditionValue;
      } else {
        limit = defaultLimitByPeriod[period] ?? 100;
      }
    } catch (error) {
      limit = defaultLimitByPeriod[period] ?? 100;
    }
  } else {
    limit = defaultLimitByPeriod[period] ?? 100;
  }

  let decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  let reasonCode = "";

  if (currentCount >= limit) {
    decision = "BLOCK"; reasonCode = "VELOCITY_EXCEEDED";
  } else if (currentCount >= limit * 0.8) {
    decision = "REQUIRE_APPROVAL"; reasonCode = "VELOCITY_APPROACHING_LIMIT";
  } else {
    decision = "PASS"; reasonCode = "VELOCITY_WITHIN_LIMIT";
  }

  const windowLabel = period === "minute" ? "minute" : period === "hour" ? "hour" : "day";
  const explanation = `Velocity: ${currentCount}/${limit} ${windowLabel}. ${currentCount >= limit ? "LIMIT EXCEEDED - BLOCKED" : "Within limits"}`;

  return { decision, currentCount, limit, period, windowStart: new Date(), policyId: policyIdInput || null, reasonCode, explanation };
}
