import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { enableEmergencyStop, disableEmergencyStop } from "@/lib/governance/emergency-stop";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthFromCookies();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const body = await request.json();
    const { enable, reason } = body;

    if (enable) {
      const result = await enableEmergencyStop(session.userId, reason || "Admin enabled emergency stop");
      return NextResponse.json({ emergencyStop: result });
    } else {
      const result = await disableEmergencyStop(session.userId);
      return NextResponse.json({ emergencyStop: result });
    }
  } catch (error) {
    return NextResponse.json({ error: "Emergency stop action failed" }, { status: 500 });
  }
}
