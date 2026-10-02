/**
 * Kill Switch (Phase 4 — Governance)
 *
 * Merchant automation control.
 * Possible state: ACTIVE | PAUSED
 *
 * When PAUSED:
 * any automated execution candidate: BLOCKED
 * Reason: AUTOMATION_PAUSED
 *
 * This check happens server-side.
 * Never trust frontend to report automation state.
 */

import { prisma } from "@/lib/prisma";

 /** Automation state */
export type AutomationState = "ACTIVE" | "PAUSED";

/** Kill switch result */
export interface KillSwitchResult {
  /** Current automation state */
  state: AutomationState;

  /** Whether automated actions are allowed */
  isAutomationAllowed: boolean;

  /** Whether automation was paused */
  wasPaused: boolean;

  /** Reason if paused */
  reason?: string;

  /** Paused by (user ID) */
  pausedBy?: string;

  /** Paused at timestamp */
  pausedAt?: Date;
}

/** Check automation state for a merchant */
export async function checkAutomationState(
  merchantId: string
): Promise<KillSwitchResult> {
  try {
    const { prisma } = await import("@/lib/prisma");

    // Check for paused automation policy
    const pausedPolicy = await prisma.policy.findFirst({
      where: {
        merchantId,
        name: "AUTOMATION_PAUSED",
        isActive: true,
      },
    });

    if (pausedPolicy) {
      return {
        state: "PAUSED",
        isAutomationAllowed: false,
        wasPaused: true,
        reason: "AUTOMATION_PAUSED",
        pausedBy: pausedPolicy.createdAt.toISOString(), // Use createdAt as proxy for pausedBy
        pausedAt: pausedPolicy.createdAt,
      };
    }

    return {
      state: "ACTIVE",
      isAutomationAllowed: true,
      wasPaused: false,
    };
  } catch (error) {
    // Fail-closed: if we can't check automation state, block by default
    return {
      state: "PAUSED",
      isAutomationAllowed: false,
      wasPaused: false,
    };
  }
}

/** Pause automation for a merchant */
export async function pauseAutomation(
  merchantId: string,
  pausedBy: string
): Promise<KillSwitchResult> {
  const { prisma } = await import("@/lib/prisma");

  const policy = await prisma.policy.create({
    data: {
      merchantId,
      name: "AUTOMATION_PAUSED",
      conditionType: "CUSTOM",
      conditionOperator: "EQ",
      conditionValue: 1,
      conditionExpression: JSON.stringify({ reason: "Merchant requested pause" }),
      action: "BLOCK",
      priority: 0, // Highest priority
      isActive: true,
    },
  });

  return {
    state: "PAUSED",
    isAutomationAllowed: false,
    wasPaused: true,
    reason: "AUTOMATION_PAUSED",
    pausedBy,
    pausedAt: new Date(),
  };
}

/** Resume automation for a merchant */
export async function resumeAutomation(
  merchantId: string
): Promise<KillSwitchResult> {
  const { prisma } = await import("@/lib/prisma");

  // Deactivate the pause policy
  await prisma.policy.updateMany({
    where: {
      merchantId,
      name: "AUTOMATION_PAUSED",
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });

  return {
    state: "ACTIVE",
    isAutomationAllowed: true,
    wasPaused: false,
  };
}

/** End of kill-switch module */

