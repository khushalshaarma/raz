import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getGrowthTimeline } from "@/lib/product/timeline";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("growthos_token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "MERCHANT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const merchant = await prisma.merchant.findFirst({
      where: { ownerId: payload.userId },
    });
    if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const timeline = await getGrowthTimeline(merchant.id, limit);
    return NextResponse.json(timeline);
  } catch (error) {
    console.error("Timeline error:", error);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}
