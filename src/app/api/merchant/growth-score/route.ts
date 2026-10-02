import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { calculateGrowthScore } from "@/lib/product/growth-score";

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

    const score = await calculateGrowthScore(merchant.id);
    return NextResponse.json(score);
  } catch (error) {
    console.error("Growth score error:", error);
    return NextResponse.json({ error: "Failed to calculate growth score" }, { status: 500 });
  }
}
