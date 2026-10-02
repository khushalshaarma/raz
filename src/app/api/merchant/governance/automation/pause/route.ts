/**
 * POST /api/merchant/governance/automation/pause
 *
 * Pause automation for the merchant.
 * Requires merchant admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { pauseAutomation } from "@/lib/governance/kill-switch";
import { getAuthFromCookies } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const merchantId = session.merchantId;
    if (!merchantId) {
      return NextResponse.json({ error: "No merchant associated" }, { status: 400 });
    }

    // Only admin/merchant can pause
    if (session.role !== "MERCHANT" && session.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const result = await pauseAutomation(merchantId, session.userId);

    return NextResponse.json({ automation: result });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to pause automation", details: (error as Error).message },
      { status: 500 }
    );
  }
}
