/**
 * GET /api/merchant/governance/actions/[id]
 *
 * Get a specific action request by ID.
 * Scoped by authenticated merchantId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getActionRequest } from "@/lib/governance/action";
import { getAuthFromCookies } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const merchantId = session.merchantId;
    if (!merchantId) {
      return NextResponse.json({ error: "No merchant associated" }, { status: 400 });
    }

    const action = await getActionRequest(id, merchantId);

    if (!action) {
      return NextResponse.json(
        { error: "Action request not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ actionRequest: action });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch action request" },
      { status: 500 }
    );
  }
}
