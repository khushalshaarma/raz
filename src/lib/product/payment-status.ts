/**
 * Canonical payment status handling.
 *
 * `Payment.status` is a free-form `String` in the schema, and the values that
 * exist in the database are UPPERCASE (`CAPTURED`, `CREATED`, `PENDING` —
 * written by the seed and by `lib/ai-buyer/checkout.ts`).
 *
 * The readers in this module previously filtered on lowercase literals
 * (`"captured"`, `"failed"`, `"refunded"`). SQLite string comparison is
 * case-sensitive, so those queries matched nothing: merchants with real
 * captured payments reported a 0% success rate, which in turn tripped a
 * HIGH-severity `PAYMENT_FAILURE` risk alert on a healthy merchant.
 *
 * Rather than hard-coding one casing and risking the same class of bug again,
 * aggregation is done case-insensitively over the distinct statuses present.
 */

/** Statuses that count as a successful collection. */
export const PAYMENT_SUCCESS_STATUSES = ["CAPTURED"] as const;

/** Statuses that count as a collection failure. */
export const PAYMENT_FAILURE_STATUSES = ["FAILED"] as const;

/** Statuses that count as a refund. */
export const PAYMENT_REFUND_STATUSES = ["REFUNDED"] as const;

export function normalizePaymentStatus(status: string): string {
  return status.trim().toUpperCase();
}

/**
 * Sum the counts of every status in `countsByStatus` that matches one of
 * `targets`, ignoring case and surrounding whitespace.
 */
export function countByCanonicalStatus(
  countsByStatus: Record<string, number>,
  targets: readonly string[]
): number {
  const wanted = new Set(targets.map(normalizePaymentStatus));
  let total = 0;
  for (const [status, count] of Object.entries(countsByStatus)) {
    if (wanted.has(normalizePaymentStatus(status))) total += count;
  }
  return total;
}

/** Total number of payments across all statuses. */
export function totalStatusCount(countsByStatus: Record<string, number>): number {
  return Object.values(countsByStatus).reduce((sum, count) => sum + count, 0);
}

/**
 * Map a provider-reported payment status onto the canonical `Payment.status`
 * vocabulary declared in the schema:
 *   CREATED | PENDING | AUTHORIZED | CAPTURED | FAILED | REFUNDED | UNKNOWN
 *
 * Razorpay reports lowercase `created | authorized | captured | failed |
 * refunded`, so an unmapped value would be written verbatim and then be
 * invisible to every reader in this module (which compare canonical
 * UPPERCASE names). Anything unrecognised maps to `UNKNOWN` rather than being
 * persisted, so an unexpected provider value can never masquerade as a
 * success or a failure.
 */
export function canonicalPaymentStatus(providerStatus: string): string {
  switch (normalizePaymentStatus(providerStatus)) {
    case "CREATED":
      return "CREATED";
    case "PENDING":
    case "ATTEMPTED":
      return "PENDING";
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "CAPTURED":
      return "CAPTURED";
    case "FAILED":
      return "FAILED";
    case "REFUNDED":
      return "REFUNDED";
    default:
      return "UNKNOWN";
  }
}

/** Payment status transitions that must never move a settled payment backwards. */
const SETTLED_STATUSES = new Set(["CAPTURED", "REFUNDED"]);

/**
 * Decide whether an incoming provider status should be written to a payment.
 *
 * Guards against out-of-order webhook delivery: Razorpay can deliver
 * `payment.captured` after `payment.failed`, and replaying a stale event would
 * otherwise resurrect a settled payment. A settled payment (captured or
 * refunded) is only ever moved to REFUNDED, never back to a pending or failed
 * state.
 */
export function shouldApplyPaymentStatusUpdate(
  currentStatus: string,
  incomingStatus: string
): boolean {
  const current = normalizePaymentStatus(currentStatus);
  const incoming = normalizePaymentStatus(incomingStatus);

  if (incoming === "UNKNOWN") return false;
  if (current === incoming) return false;
  if (!SETTLED_STATUSES.has(current)) return true;

  // Already settled: only a refund is a legitimate forward transition.
  return incoming === "REFUNDED" && current !== "REFUNDED";
}
