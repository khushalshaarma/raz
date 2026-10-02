/**
 * POST /api/merchant/governance/approvals/[id]/approve
 *
 * Approve a pending governance decision.
 *
 * The `:id` segment may be either a `GovernanceDecision.id` or the related
 * `ActionRequest.id` — the approvals UI lists action requests and passes
 * their id, so both must resolve.
 *
 * Every lookup is scoped to the authenticated merchant, so one merchant can
 * never read or approve another merchant's decision.
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

    // Four-eyes: the approver must not be the requester.
    //
    // `requestedBy` is null only for machine-originated requests (agent growth
    // cycles, AI buyer). Those have no human requester, so the approving human
    // is inherently an independent second party and there is nothing to
    // collide with. The approver-side check is kept as a defence in depth.
    const fourEyesViolation =
      (decision.requestedBy !== null && decision.requestedBy === userId) ||
      (decision.approvedBy !== null && decision.approvedBy === userId);

    if (fourEyesViolation) {
      await prisma.auditLog.create({
        data: {
          merchantId,
          action: "APPROVAL_FOUR_EYES_VIOLATION",
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
          error:
            "Four-eyes violation: you cannot approve an action you requested",
          requestedBy: decision.requestedBy,
        },
        { status: 403 }
      );
    }

    // Atomic: approve decision + update action request + create audit log
    const approvedAt = new Date();
    await prisma.$transaction(async (tx) => {
      // Guarded update: a concurrent approver may have won the race.
      const updated = await tx.governanceDecision.updateMany({
        where: { id: decision.id, merchantId, status: "PENDING" },
        data: {
          status: "APPROVED",
          approvedBy: userId,
          approvedAt,
        },
      });

      if (updated.count === 0) {
        throw new Error("Decision was already processed (race condition detected)");
      }

      // Update linked action request status
      await tx.actionRequest.updateMany({
        where: { id: decision.actionRequestId, merchantId, status: "PENDING" },
        data: { status: "APPROVED" },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          merchantId,
          action: "APPROVAL_APPROVED",
          resourceType: "GOVERNANCE_DECISION",
          resourceId: decision.id,
          outcome: "APPROVED",
          details: JSON.stringify({
            approvedBy: userId,
            actionRequestId: decision.actionRequestId,
            requestedId: id,
          }),
          severity: "INFO",
        },
      });
    });

    return NextResponse.json({
      message: "Governance decision approved",
      decisionId: decision.id,
      actionRequestId: decision.actionRequestId,
      approvedBy: userId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Approval failed", details: (error as Error).message },
      { status: 500 }
    );
  }
}
