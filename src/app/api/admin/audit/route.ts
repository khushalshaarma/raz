import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, authorizeRoutes } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const auth = authorizeRoutes(user, ["ADMIN"]);
    if ("response" in auth) return auth.response;

    // `AuditLog` is the canonical audit table (see `lib/audit.ts`). This
    // previously read `AuditEvent`, so the admin view missed every entry
    // written by the governance-critical paths: webhook handling, AI buyer,
    // execution settlement, policy changes and emergency stop.
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return successResponse({ auditLogs, auditEvents: auditLogs });
  } catch (error) {
    console.error("Admin audit error:", error);
    return errorResponse("Failed to load audit logs");
  }
}