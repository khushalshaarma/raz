/**
 * POST /api/merchant/governance/approvals/[id]/reject
 *
 * Reject a pending governance decision.
 *
 * The `:id` segment may be either a `GovernanceDecision.id` or the related
 * `ActionRequest.id` — the approvals UI lists action requests and passes
 * their id, so both must resolve.
 *
 * Every lookup is scoped to the authenticated merchant, so one merchant can
 * never read or reject another merchant's decision.
 *
 * Atomic: GovernanceDecision + ActionRequest + AuditLog updated together.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromRequest } from "@/lib/auth";
import { findApprovalTargetForMerchant } from "@/lib/governance/approval-lookup";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const merchantId = session.merchantId;
    if (!merchantId) {
      return NextResponse.json({ error: "No merchant associated" }, { status: 400 });
    }

    const { id } = await params;
    const userId = session.userId;

    let rejectionReason = "Rejected by approver";
    try {
      const body = await request.json();
      if (typeof body?.reason === "string" && body.reason.trim().length > 0) {
        rejectionReason = body.reason.trim().slice(0, 500);
      }
    } catch {
      // Body is optional; fall back to the default reason.
    }

    // Scoped to the authenticated merchant — never looked up by bare id.
    const decision = await findApprovalTargetForMerchant(id, merchantId);

    if (!decision) {
      return NextResponse.json(
        { error: "Governance decision not found" },
        { status: 404 }
      );
    }

    if (decision.status !== "PENDING") {
      return NextResponse.json(
        {
          error: "Decision is not pending approval",
          status: decision.status,
        },
        { status: 400 }
      );
    }

    // Four-eyes applies symmetrically: a requester must not be able to
    // unilaterally dispose of their own request in either direction.
    const fourEyesViolation =
      (decision.requestedBy !== null && decision.requestedBy === userId) ||
      (decision.approvedBy !== null && decision.approvedBy === userId);

    if (fourEyesViolation) {
      await prisma.auditLog.create({
        data: {
          merchantId,
          action: "REJECTION_FOUR_EYES_VIOLATION",
          resourceType: "GOVERNANCE_DECISION",
          resourceId: decision.id,
          outcome: "BLOCKED",
          details: JSON.stringify({
            userId,
            requestedBy: decision.requestedBy,
            approvedBy: decision.approvedBy,
            actionRequestId: decision.actionRequestId,
          }),
          severity: "WARNING",
        },
      });

      return NextResponse.json(
        {
          error: "Four-eyes violation: you cannot decide an action you requested",
          requestedBy: decision.requestedBy,
        },
        { status: 403 }
      );
    }

    // Atomic: reject decision + update action request + create audit log
    await prisma.$transaction(async (tx) => {
      const updated = await tx.governanceDecision.updateMany({
        where: { id: decision.id, merchantId, status: "PENDING" },
        data: {
          // `status` vocabulary has no REJECTED value, so an operator
          // rejection is recorded as BLOCKED. The original policy `decision`
          // (ALLOW | BLOCK | REQUIRE_APPROVAL) is left untouched so a human
          // rejection is not miscounted as a policy block.
          status: "BLOCKED",
          decisionReason: rejectionReason,
          approvedBy: userId,
          approvedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        throw new Error("Decision was already processed (race condition detected)");
      }

      await tx.actionRequest.updateMany({
        where: { id: decision.actionRequestId, merchantId, status: "PENDING" },
        data: { status: "BLOCKED", reason: rejectionReason },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          action: "APPROVAL_REJECTED",
          resourceType: "GOVERNANCE_DECISION",
          resourceId: decision.id,
          outcome: "BLOCKED",
          details: JSON.stringify({
            rejectedBy: userId,
            actionRequestId: decision.actionRequestId,
            requestedId: id,
            reason: rejectionReason,
          }),
          severity: "WARNING",
        },
      });
    });

    return NextResponse.json({
      message: "Governance decision rejected",
      decisionId: decision.id,
      actionRequestId: decision.actionRequestId,
      reason: rejectionReason,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Rejection failed", details: (error as Error).message },
      { status: 500 }
    );
  }
}
