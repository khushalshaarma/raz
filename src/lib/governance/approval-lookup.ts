import { prisma } from "@/lib/prisma";

/**
 * Resolve a governance decision from an identifier used by the approvals UI.
 *
 * The approvals list is driven by `ActionRequest` rows, so the UI passes an
 * `ActionRequest.id`. Other callers pass a `GovernanceDecision.id` directly.
 * Accepting both keeps a single identifier working everywhere.
 *
 * The lookup is ALWAYS scoped to `merchantId`. A bare `findUnique({ id })`
 * would let any authenticated merchant approve or reject any other
 * merchant's decision.
 */
export async function findApprovalTargetForMerchant(
  id: string,
  merchantId: string
) {
  return prisma.governanceDecision.findFirst({
    where: {
      merchantId,
      OR: [{ id }, { actionRequestId: id }],
    },
    orderBy: { createdAt: "desc" },
  });
}
