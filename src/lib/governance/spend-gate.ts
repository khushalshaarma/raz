import { prisma } from "@/lib/prisma";

export interface SpendGateResult {
  decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  currentAmountMinor: number;
  limitMinor: number;
  period: string;
  policyId: string | null;
  reasonCode: string;
  explanation: string;
}

export interface SpendGateInput {
  amountMinor: number;
  merchantId?: string;
  dailyTotalMinor?: number;
  monthlyTotalMinor?: number;
  perCustomerTotalMinor?: number;
  policyId?: string;
  currency: string;
}

export async function evaluateSpendGate(
  input: SpendGateInput
): Promise<SpendGateResult> {
  const { amountMinor, dailyTotalMinor = 0, monthlyTotalMinor = 0, perCustomerTotalMinor = 0, policyId: policyIdInput, currency = "INR" } = input;

  if (currency !== "INR") throw new Error(`Spend engine only supports INR currency, got: ${currency}`);
  if (typeof amountMinor !== "number" || amountMinor < 0 || !Number.isInteger(amountMinor)) {
    throw new Error("amountMinor must be a non-negative integer in paise");
  }

  let limitActionMinor = 50000;
  let limitDailyMinor = 1000000;
  let limitMonthlyMinor = 10000000;
  let limitPerCustomerMinor = 200000;

  if (policyIdInput) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const policy = await prisma.policy.findUnique({ where: { id: policyIdInput } });
      if (policy && policy.isActive && policy.conditionType === "SPEND") {
        const val = policy.conditionValue;
        const expr = (policy.conditionExpression || "").toUpperCase();
        if (expr.includes("ACTION")) { limitActionMinor = val; limitDailyMinor = val; limitMonthlyMinor = val; limitPerCustomerMinor = val; }
        else if (expr.includes("DAILY")) { limitDailyMinor = val; }
        else if (expr.includes("MONTHLY")) { limitMonthlyMinor = val; }
        else if (expr.includes("CUSTOMER")) { limitPerCustomerMinor = val; }
        else { limitActionMinor = val; limitDailyMinor = val; limitMonthlyMinor = val; limitPerCustomerMinor = val; }
      }
    } catch (error) { /* Fall back to defaults */ }
  }

  let decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK" = "PASS";
  let reasonCode = "";
  let checkedPeriod = "action";

  if (amountMinor >= limitActionMinor) {
    decision = "BLOCK"; reasonCode = "SPEND_ACTION_LIMIT_EXCEEDED"; checkedPeriod = "action";
  } else if (dailyTotalMinor + amountMinor > limitDailyMinor) {
    decision = "BLOCK"; reasonCode = "SPEND_DAILY_LIMIT_EXCEEDED"; checkedPeriod = "daily";
  } else if (monthlyTotalMinor + amountMinor > limitMonthlyMinor) {
    decision = "BLOCK"; reasonCode = "SPEND_MONTHLY_LIMIT_EXCEEDED"; checkedPeriod = "monthly";
  } else if (perCustomerTotalMinor + amountMinor > limitPerCustomerMinor) {
    decision = "BLOCK"; reasonCode = "SPEND_PER_CUSTOMER_LIMIT_EXCEEDED"; checkedPeriod = "per_customer";
  } else if (dailyTotalMinor + amountMinor >= limitDailyMinor * 0.8) {
    decision = "REQUIRE_APPROVAL"; reasonCode = "SPEND_APPROACHING_DAILY_LIMIT"; checkedPeriod = "daily";
  } else if (monthlyTotalMinor + amountMinor >= limitMonthlyMinor * 0.8) {
    decision = "REQUIRE_APPROVAL"; reasonCode = "SPEND_APPROACHING_MONTHLY_LIMIT"; checkedPeriod = "monthly";
  } else if (perCustomerTotalMinor + amountMinor >= limitPerCustomerMinor * 0.8) {
    decision = "REQUIRE_APPROVAL"; reasonCode = "SPEND_APPROACHING_PER_CUSTOMER_LIMIT"; checkedPeriod = "per_customer";
  }

  const limitMinor = checkedPeriod === "action" ? limitActionMinor : checkedPeriod === "daily" ? limitDailyMinor : checkedPeriod === "monthly" ? limitMonthlyMinor : limitPerCustomerMinor;

  const explanation = `Spend: ₹${(amountMinor / 100).toFixed(2)} (action) | Daily: ₹${(dailyTotalMinor / 100).toFixed(2)}/₹${(limitDailyMinor / 100).toFixed(2)} | Monthly: ₹${(monthlyTotalMinor / 100).toFixed(2)}/₹${(limitMonthlyMinor / 100).toFixed(2)} | Per customer: ₹${(perCustomerTotalMinor / 100).toFixed(2)}/₹${(limitPerCustomerMinor / 100).toFixed(2)}. ${decision === "BLOCK" ? "EXCEEDED - BLOCKED" : decision === "REQUIRE_APPROVAL" ? "APPROVAL NEEDED" : "Within limits"}.`;

  return { decision, currentAmountMinor: amountMinor, limitMinor, period: checkedPeriod, policyId: policyIdInput || null, reasonCode, explanation };
}
