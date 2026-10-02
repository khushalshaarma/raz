import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";

/**
 * GET /api/merchant/audit
 *
 * Reads `AuditLog`, the canonical audit table. This previously read
 * `AuditEvent`, a parallel table that only the (now dead) `createAuditEvent`
 * helper wrote to, so the merchant saw 4 of 5 rows while the 1000+ rows in
 * `AuditLog` — written by the webhook handler, AI buyer, execution settlement,
 * the policy routes and emergency stop — were invisible.
 */
export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const auditLogs = await prisma.auditLog.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return successResponse({ auditLogs });
  } catch (error) {
    console.error("Audit logs error:", error);
    return errorResponse("Failed to load audit logs");
  }
}
