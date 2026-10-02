/**
 * GET /api/admin/security
 *
 * Admin security dashboard.
 * Shows blocked actions, security alerts, policy violations, velocity violations.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admin can access security dashboard
    if (session.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get("merchantId");

    // Get recent blocked actions
    const blockedActions = await prisma.actionRequest.findMany({
      where: {
        status: "BLOCKED",
        ...(merchantId ? { merchantId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get recent security violations
    const securityViolations = await prisma.auditLog.findMany({
      where: {
        severity: "CRITICAL",
        ...(merchantId ? { merchantId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get velocity violations
    const velocityViolations = await prisma.auditLog.findMany({
      where: {
        action: { contains: "VELOCITY" },
        ...(merchantId ? { merchantId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Check emergency stop status
    const emergencyStop = await prisma.systemHealth.findFirst({
      where: { application: "ok" },
    });

    return NextResponse.json({
      blockedActions,
      securityViolations,
      velocityViolations,
      emergencyStopActive: emergencyStop?.api === "STOPPED",
      totalBlocked: blockedActions.length,
      totalCritical: securityViolations.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch security data", details: (error as Error).message },
      { status: 500 }
    );
  }
}
