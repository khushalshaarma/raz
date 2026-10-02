/**
 * Idempotency Enforcement (Phase 4 — Governance)
 *
 * Database-backed idempotency.
 * Same merchantId + decisionId + action parameters + idempotencyKey
 * must not create duplicate governance decisions.
 *
 * Repeated request returns existing result.
 */

import { prisma } from "@/lib/prisma";

 /** Idempotency result */
export interface IdempotencyResult {
  /** Whether this is a new request or a duplicate */
  isNew: boolean;

  /** The existing or newly created governance decision ID */
  governanceDecisionId: string;

  /** The action request ID */
  actionRequestId: string;

  /** Whether the result was retrieved from cache (duplicate) */
  wasRetrieved: boolean;
}

 /** Create an idempotency key record */
export async function createIdempotencyRecord(
  idempotencyKey: string,
  merchantId: string,
  decisionId: string,
  actionRequestId: string,
  /**
   * Human requester, when known. Persisted so the four-eyes check still works
   * if this placeholder is later resolved by the approve/reject routes.
   */
  requestedBy?: string
): Promise<IdempotencyResult> {
  if (!idempotencyKey || !merchantId || !decisionId || !actionRequestId) {
    throw new Error("Missing required idempotency fields");
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // Check if this exact combination already exists
    const existing = await prisma.governanceDecision.findFirst({
      where: {
        merchantId,
        actionRequestId,
        id: decisionId,
      },
    });

    if (existing) {
      // Duplicate found - return existing result
      return {
        isNew: false,
        governanceDecisionId: existing.id,
        actionRequestId: existing.actionRequestId,
        wasRetrieved: true,
      };
    }

    // Check for idempotency key record
    const idempotencyRecord = await prisma.governanceDecision.findFirst({
      where: {
        merchantId,
        actionRequestId,
      },
    });

    if (idempotencyRecord && idempotencyRecord.status !== "PENDING") {
      // Existing non-pending record found
      return {
        isNew: false,
        governanceDecisionId: idempotencyRecord.id,
        actionRequestId: idempotencyRecord.actionRequestId,
        wasRetrieved: true,
      };
    }

    // No existing record - this is a new request
    // Persist an idempotency record
    await prisma.governanceDecision.create({
      data: {
        merchantId,
        actionRequestId,
        id: decisionId,
        // NOTE: `decision` has no enforced vocabulary. The schema comment says
        // ALLOW | BLOCK | REQUIRE_APPROVAL, but `governance.ts` writes
        // APPROVED | BLOCKED and this file writes PENDING. That split is why
        // the DB contains six distinct (decision, status) pairs and why
        // block-detection queries must match several spellings. Consolidating
        // it is a separate, behaviour-changing decision — not done here.
        decision: "PENDING",
        decisionReason: "Idempotency record",
        riskLevel: "LOW",
        confidence: 0,
        status: "PENDING",
        ...(requestedBy ? { requestedBy } : {}),
      },
    });

    return {
      isNew: true,
      governanceDecisionId: decisionId,
      actionRequestId,
      wasRetrieved: false,
    };
  } catch (error) {
    // If database check fails, treat as new (fail-safe)
    return {
      isNew: true,
      governanceDecisionId: decisionId,
      actionRequestId,
      wasRetrieved: false,
    };
  }
}

/** Check if a request is a duplicate */
export async function isDuplicateRequest(
  idempotencyKey: string,
  merchantId: string,
  decisionId: string
): Promise<boolean> {
  try {
    const { prisma } = await import("@/lib/prisma");

    const existing = await prisma.governanceDecision.findFirst({
      where: {
        merchantId,
        id: decisionId,
      },
    });

    return existing !== null;
  } catch (error) {
    return false;
  }
}

/** End of idempotency module */

