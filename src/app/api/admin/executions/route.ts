import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, authorizeRoutes } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const auth = authorizeRoutes(user, ["ADMIN"]);
    if ("response" in auth) return auth.response;

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const merchantId = url.searchParams.get("merchantId") || undefined;
    const take = parseInt(url.searchParams.get("take") || "50");
    const skip = parseInt(url.searchParams.get("skip") || "0");

    const where: any = {};
    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;

    const executions = await prisma.execution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        executionAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
        reconciliation: true,
        merchant: { select: { businessName: true } },
      },
    });

    const total = await prisma.execution.count({ where });

    return successResponse({ executions, total });
  } catch (error) {
    console.error("Admin executions error:", error);
    return errorResponse("Failed to load executions");
  }
}
