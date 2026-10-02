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

    const where: any = {};
    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;

    const reconciliations = await prisma.reconciliation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: { execution: true },
    });

    return successResponse({ reconciliations });
  } catch (error) {
    console.error("Admin reconciliation error:", error);
    return errorResponse("Failed to load reconciliation data");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const auth = authorizeRoutes(user, ["ADMIN"]);
    if ("response" in auth) return auth.response;

    const body = await request.json();
    const { reconciliationId, status } = body;

    if (!reconciliationId || !status) {
      return errorResponse("reconciliationId and status required", 400);
    }

    const reconciliation = await prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
    if (!reconciliation) {
      return errorResponse("Reconciliation not found", 404);
    }

    await prisma.reconciliation.update({
      where: { id: reconciliationId },
      data: { status, resolvedAt: new Date() },
    });

    return successResponse({ success: true });
  } catch (error) {
    console.error("Admin reconciliation error:", error);
    return errorResponse("Failed to resolve reconciliation");
  }
}
