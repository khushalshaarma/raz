import { prisma } from "@/lib/prisma";
import type { AuditActorType, AuditSeverity, AuditAction } from "@/types";

interface CreateAuditEventInput {
  merchantId?: string;
  actorType: AuditActorType;
  actorId?: string;
  action: AuditAction | string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
  /**
   * `AuditLog.outcome` is required. Defaults to `ALLOWED` because this helper
   * records that something happened, not that a gate was evaluated; callers
   * reporting a denial pass BLOCKED explicitly.
   */
  outcome?: string;
}

/**
 * Foundation audit helper.
 *
 * Writes to `AuditLog`, which is the canonical audit table: it is what every
 * governance-critical writer already uses (webhooks, AI buyer, execution
 * settlement, all `/api/policies` routes, emergency stop, agent runs), and it
 * carries `outcome` and `severity` for filtering.
 *
 * This helper previously wrote to `AuditEvent`, a parallel table with a single
 * dead caller and no readers of consequence, which split the audit trail in
 * two. `AuditEvent` rows already written are left in place (no destructive
 * migration); the model is retained but nothing new is written to it.
 *
 * NOTE: still best-effort. It must NOT throw / block the request flow if
 * auditing fails, so the error is logged rather than propagated. Callers that
 * need the audit row to be atomic with their own writes (approvals, execution
 * settlement) write `AuditLog` inside their own `prisma.$transaction` instead
 * of calling this helper.
 */
export async function createAuditEvent(input: CreateAuditEventInput): Promise<void> {
  const severity = input.severity ?? "INFO";
  try {
    await prisma.auditLog.create({
      data: {
        merchantId: input.merchantId ?? null,
        action: input.action,
        // `AuditLog.resourceType`/`resourceId` are required, whereas
        // `AuditEvent` allowed nulls. Fall back to explicit placeholders so an
        // event is never silently dropped for missing optional metadata.
        resourceType: input.resourceType ?? "UNKNOWN",
        resourceId: input.resourceId ?? input.actorId ?? "unknown",
        outcome: input.outcome ?? "ALLOWED",
        details: input.metadata ? JSON.stringify({ ...input.metadata, actorType: input.actorType, actorId: input.actorId }) : JSON.stringify({ actorType: input.actorType, actorId: input.actorId }),
        severity,
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}
