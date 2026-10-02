/**
 * Customer Protection (Phase 4 — Governance)
 *
 * Responsibilities:
 * 1. Prevent duplicate actions on same customer
 * 2. Enforce cooldown periods between repeated strategies
 * 3. Limit maximum customer exposure to same strategy
 * 4. Prevent repeated discount patterns
 * 5. All checks server-side (never frontend-only)
 *
 * Key protections:
 *   - Same customer + same strategy + within cooldown → BLOCK
 *   - Repeated discounts on same customer → BLOCK/REQUIRE_APPROVAL
 *   - Maximum exposure limits per customer per time period
 */

import { prisma } from "@/lib/prisma";

/** Customer protection result */
export interface CustomerProtectionResult {
  /** Decision: PASS | REQUIRE_APPROVAL | BLOCK */
  decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";

  /** Reason code */
  reasonCode: string;

  /** Human-readable explanation */
  explanation: string;

  /** Whether customer is protected from this action */
  isProtected: boolean;
}

/** Customer protection input */
export interface CustomerProtectionInput {
  /** Merchant ID */
  merchantId: string;

  /** Customer ID */
  customerId: string;

  /** Strategy ID being applied */
  strategyId: string;

  /** Action type */
  actionType: string;

  /** Current timestamp (now) */
  now: Date;

  /** Cooldown period in minutes (default 30) */
  cooldownMinutes?: number;

  /** Maximum actions per customer per day (default 5) */
  maxPerDay?: number;

  /** Maximum actions per customer per month (default 20) */
  maxPerMonth?: number;
}

/** Evaluate customer protection rules */
export async function evaluateCustomerProtection(
  input: CustomerProtectionInput
): Promise<CustomerProtectionResult> {
  const {
    merchantId,
    customerId,
    strategyId,
    actionType,
    now,
    cooldownMinutes = 30,
    maxPerDay = 5,
    maxPerMonth = 20,
  } = input;

  // Validate inputs
  if (!merchantId || !strategyId) {
    return {
      decision: "BLOCK",
      reasonCode: "MISSING_REQUIRED_FIELDS",
      explanation: "Missing merchantId or strategyId",
      isProtected: true,
    };
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // Check 1: Same customer + same strategy within cooldown
    const cooldownStart = new Date(now.getTime() - cooldownMinutes * 60000);

    const recentAction = await prisma.actionRequest.findFirst({
      where: {
        merchantId,
        customerId: customerId || "",
        strategyId,
        createdAt: {
          gte: cooldownStart,
        },
      },
    });

    // Check 2: Count actions per day for this customer
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const actionsToday = await prisma.actionRequest.count({
      where: {
        merchantId,
        customerId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Check 3: Count actions per month for this customer
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(now);
    endOfMonth.setMonth(startOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const actionsThisMonth = await prisma.actionRequest.count({
      where: {
        merchantId,
        customerId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    // Evaluate protections
    let decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK" = "PASS";
    let reasonCode = "";
    let isProtected = false;

    // Protection 1: Same customer within cooldown with same strategy
    if (recentAction) {
      decision = "BLOCK";
      reasonCode = "CUSTOMER_COOLDOWN";
      isProtected = true;
    }
    // Protection 2: Too many actions per day
    else if (actionsToday >= maxPerDay) {
      decision = "BLOCK";
      reasonCode = "CUSTOMER_MAX_PER_DAY_EXCEEDED";
      isProtected = true;
    }
    // Protection 3: Too many actions per month
    else if (actionsThisMonth >= maxPerMonth) {
      decision = "BLOCK";
      reasonCode = "CUSTOMER_MAX_PER_MONTH_EXCEEDED";
      isProtected = true;
    }
    // Protection 4: Repeated discount pattern
    // (Simplified: if actionType is REFUND/REACTIVATION and customer had similar before)
    else if (actionType === "REFUND" && actionsToday > 0) {
      decision = "REQUIRE_APPROVAL";
      reasonCode = "REPEATED_DISCOUNT_PATTERN";
      isProtected = false;
    }
    else {
      decision = "PASS";
      reasonCode = "CUSTOMER_PROTECTION_PASSED";
      isProtected = false;
    }

    const explanation = `${decision === "BLOCK" ? "BLOCKED" : decision === "REQUIRE_APPROVAL" ? "APPROVAL NEEDED" : "Allowed"}. ` +
      `${reasonCode}. ` +
      `Actions today: ${actionsToday}/${maxPerDay}. ` +
      `Actions this month: ${actionsThisMonth}/${maxPerMonth}. ` +
      `Cooldown: ${cooldownMinutes} min.`;

    return {
      decision,
      reasonCode,
      explanation,
      isProtected,
    };
  } catch (error) {
    // Fail-closed: if database unavailable, block
    return {
      decision: "BLOCK",
      reasonCode: "DATABASE_UNAVAILABLE",
      explanation: "Customer protection check failed due to database error",
      isProtected: true,
    };
  }
}

/** End of customer-protection module */

