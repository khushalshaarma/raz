import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";
import { listSimulations, getSimulationStats, runSimulation } from "@/lib/product/simulation-center";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { searchParams } = new URL(request.url);
    const opportunityType = searchParams.get("opportunityType") || undefined;
    const riskLevel = searchParams.get("riskLevel") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    const [simulations, stats] = await Promise.all([
      listSimulations(merchantId, { opportunityType, riskLevel, limit }),
      getSimulationStats(merchantId),
    ]);

    return successResponse({ simulations, stats });
  } catch (error) {
    console.error("Simulations list error:", error);
    return errorResponse("Failed to load simulations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const body = await request.json();
    const { opportunityType, strategyId, strategyName } = body as {
      opportunityType?: string;
      strategyId?: string;
      strategyName?: string;
    };

    if (!opportunityType || !strategyId || !strategyName) {
      return errorResponse("opportunityType, strategyId, and strategyName are required", 400);
    }

    const result = await runSimulation(merchantId, opportunityType, strategyId, strategyName);
    return successResponse({ simulation: result });
  } catch (error) {
    console.error("Simulation run error:", error);
    return errorResponse("Failed to run simulation");
  }
}
