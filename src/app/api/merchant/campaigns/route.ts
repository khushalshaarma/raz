import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const campaigns = await prisma.campaign.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    return successResponse({ campaigns });
  } catch (error) {
    console.error("Campaigns error:", error);
    return errorResponse("Failed to load campaigns");
  }
}
