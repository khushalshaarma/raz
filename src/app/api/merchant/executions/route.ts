import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";
import { executeAction, listMerchantExecutions, getExecutionDetails } from "@/lib/execution/execution-service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const take = parseInt(url.searchParams.get("take") || "20");
    const skip = parseInt(url.searchParams.get("skip") || "0");
    const id = url.searchParams.get("id");

    if (id) {
      const execution = await getExecutionDetails(id, merchantId);
      if (!execution) {
        return errorResponse("Execution not found", 404);
      }
      return successResponse({ execution });
    }

    const executions = await listMerchantExecutions(merchantId, { status, take, skip });
    return successResponse({ executions });
  } catch (error) {
    console.error("Executions error:", error);
    return errorResponse("Failed to load executions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const body = await request.json();

    const result = await executeAction({
      executionReadyActionId: body.executionReadyActionId,
      merchantId,
    });

    if (!result.success) {
      return errorResponse(result.error || "Execution failed", 400);
    }

    return successResponse({ execution: result });
  } catch (error) {
    console.error("Execution error:", error);
    return errorResponse("Execution failed");
  }
}
