import { prisma } from "@/lib/prisma";

export interface EmergencyStopResult {
  enabled: boolean;
  allActionsBlocked: boolean;
  enabledBy?: string;
  enabledAt?: Date;
  reason?: string;
}

export async function checkEmergencyStop(): Promise<EmergencyStopResult> {
  try {
    const { prisma } = await import("@/lib/prisma");
const health = await prisma.systemHealth.findFirst({
      orderBy: { lastCheckedAt: "desc" },
    });
    if (health && health.api === "STOPPED") {
      return { enabled: true, allActionsBlocked: true, reason: "GLOBAL_EMERGENCY_STOP" };
    }
    return { enabled: false, allActionsBlocked: false };
  } catch (error) {
    // Fail-closed: if we can't check emergency stop, assume it's enabled
    return { enabled: true, allActionsBlocked: true, reason: "EMERGENCY_STOP_CHECK_FAILED" };
  }
}

export async function enableEmergencyStop(
  adminId: string,
  reason: string
): Promise<EmergencyStopResult> {
  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.systemHealth.findFirst({
    orderBy: { lastCheckedAt: "desc" },
  });
  if (existing) {
    try {
      await prisma.systemHealth.update({
        where: { id: existing.id },
        data: { api: "STOPPED", lastCheckedAt: new Date() },
      });
    } catch {
      await prisma.systemHealth.create({
        data: { application: "ok", api: "STOPPED", database: "ok", environment: "production", lastCheckedAt: new Date() },
      });
    }
  } else {
    await prisma.systemHealth.create({
      data: { application: "ok", api: "STOPPED", database: "ok", environment: "production", lastCheckedAt: new Date() },
    });
  }
  await prisma.auditLog.create({
    data: {
      action: "EMERGENCY_STOP_ENABLED", resourceType: "GOVERNANCE",
      resourceId: adminId, outcome: "BLOCKED",
      details: JSON.stringify({ reason, enabledBy: adminId }), severity: "CRITICAL",
    },
  });
  return { enabled: true, allActionsBlocked: true, enabledBy: adminId, enabledAt: new Date(), reason };
}

export async function disableEmergencyStop(
  adminId: string
): Promise<EmergencyStopResult> {
  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.systemHealth.findFirst({
    orderBy: { lastCheckedAt: "desc" },
  });
  if (existing) {
    try {
      await prisma.systemHealth.update({
        where: { id: existing.id },
        data: { api: "ok", lastCheckedAt: new Date() },
      });
    } catch {
      await prisma.systemHealth.create({
        data: { application: "ok", api: "ok", database: "ok", environment: "production", lastCheckedAt: new Date() },
      });
    }
  } else {
    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok", environment: "production", lastCheckedAt: new Date() },
    });
  }
  await prisma.auditLog.create({
    data: {
      action: "EMERGENCY_STOP_DISABLED", resourceType: "GOVERNANCE",
      resourceId: adminId, outcome: "ALLOWED",
      details: JSON.stringify({ disabledBy: adminId }), severity: "INFO",
    },
  });
  return { enabled: false, allActionsBlocked: false, enabledBy: adminId, enabledAt: new Date(), reason: "Emergency stop disabled by admin" };
}
