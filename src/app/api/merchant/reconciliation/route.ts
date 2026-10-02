import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";
import { reconcileAndRecord } from "@/lib/execution/execution-service";
import { getReconciliationStatus, listReconciliationAlerts } from "@/lib/execution/reconciliation";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const url = new URL(request.url);
    const executionId = url.searchParams.get("executionId");
    const alerts = url.searchParams.get("alerts") === "true";

    if (alerts) {
      const alertList = await listReconciliationAlerts(merchantId);
      return successResponse({ alerts: alertList });
    }

    if (executionId) {
      const status = await getReconciliationStatus(executionId);
      return successResponse({ reconciliation: status });
    }

    return errorResponse("executionId or alerts parameter required", 400);
  } catch (error) {
    console.error("Reconciliation error:", error);
    return errorResponse("Failed to load reconciliation data");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const body = await request.json();
    const { executionId } = body;

    if (!executionId) {
      return errorResponse("executionId required", 400);
    }

    const execution = await prisma.execution.findUnique({ where: { id: executionId } });
    if (!execution || execution.merchantId !== merchantId) {
      return errorResponse("Execution not found", 404);
    }

    const result = await reconcileAndRecord(executionId);
    return successResponse({ reconciliation: result });
  } catch (error) {
    console.error("Reconciliation error:", error);
    return errorResponse("Reconciliation failed");
  }
}
