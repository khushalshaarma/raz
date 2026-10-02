import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  canonicalPaymentStatus,
  shouldApplyPaymentStatusUpdate,
} from "@/lib/product/payment-status";
import { verifyRazorpayWebhookSignature } from "./signatures";
import { getRazorpayConfig } from "./config";

export interface WebhookProcessingResult {
  /**
   * - PROCESSED    verified and applied to the payment
   * - VERIFIED     recorded, but deliberately not applied (no webhook secret
   *                configured, so the payload cannot be trusted)
   * - DUPLICATE    already seen; no state change
   * - UNHANDLED    verified, but no matching local payment / no status field
   * - REJECTED     signature invalid or body unparseable
   * - ERROR        unexpected failure
   */
  status: "PROCESSED" | "VERIFIED" | "DUPLICATE" | "UNHANDLED" | "REJECTED" | "ERROR";
  message: string;
  /**
   * Whether the payload's signature was cryptographically verified.
   *
   * Callers MUST gate every state change on this. It is false whenever
   * `RAZORPAY_WEBHOOK_SECRET` is unset, in which case the handler accepts any
   * body and no state derived from it can be trusted.
   */
  signatureVerified: boolean;
}

export async function processWebhookEvent(
  body: string,
  signature: string,
  eventType?: string
): Promise<WebhookProcessingResult> {
  const config = getRazorpayConfig();

  // True only when a secret is configured AND the signature matched. Computed
  // up front so every return path can report it.
  const secretConfigured = Boolean(config.webhookSecret);
  let signatureVerified = false;

  if (config.webhookSecret) {
    const isValid = verifyRazorpayWebhookSignature(body, signature, config.webhookSecret);
    if (!isValid) {
      return { status: "REJECTED", message: "Invalid webhook signature", signatureVerified: false };
    }
    signatureVerified = true;
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: "REJECTED", message: "Invalid JSON payload", signatureVerified };
  }

  // `crypto` is not bound by `import { createHash } from "crypto"`, so the
  // previous `crypto.randomUUID()` threw a ReferenceError on this fallback
  // path — exactly the path taken by a malformed payload with no ids.
  const eventId = payload.id || payload.payload?.payment?.entity?.id || randomUUID();
  const event = eventType || payload.event || "unknown";

  const existingEvent = await prisma.webhookEvent.findFirst({
    where: { provider: "razorpay", eventId },
  });

  if (existingEvent) {
    if (existingEvent.status === "PROCESSED") {
      return { status: "DUPLICATE", message: "Event already processed", signatureVerified };
    }

    await prisma.webhookEvent.update({
      where: { id: existingEvent.id },
      data: {
        retryCount: existingEvent.retryCount + 1,
        receivedAt: new Date(),
      },
    });

    return { status: "DUPLICATE", message: "Event already received", signatureVerified };
  }

  const payloadHash = createHash("sha256").update(body).digest("hex");

  // Razorpay payloads reference the payment, not the merchant, so merchant
  // scope is resolved by joining `providerPaymentId`. A payload that cannot be
  // attributed to a merchant is still persisted (merchantId = null) so it is
  // available for forensics rather than silently dropped.
  const paymentEntity = payload?.payload?.payment?.entity;
  const providerPaymentId: string | undefined =
    paymentEntity?.id ?? payload?.payload?.refund?.entity?.payment_id;

  const payment = providerPaymentId
    ? await prisma.payment.findFirst({
        where: { providerPaymentId },
        select: { id: true, merchantId: true, status: true },
      })
    : null;

  const merchantId = payment?.merchantId ?? null;

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "razorpay",
      eventId,
      eventType: event,
      merchantId,
      payload: body,
      payloadHash,
      signature,
      signatureVerified,
      status: "VERIFIED",
    },
  });

  // Only a signature-verified payload is allowed to move a payment. Without
  // RAZORPAY_WEBHOOK_SECRET configured the handler accepts any body, so
  // applying its status field would let an unauthenticated caller mark payments
  // as captured. Fail closed instead: record the event, apply nothing.
  if (!signatureVerified) {
    return {
      status: "VERIFIED",
      message:
        "Webhook event stored but not applied: no webhook secret configured, so the payload is unverified",
      signatureVerified: false,
    };
  }

  if (!payment) {
    // Reconciliation: a signature-verified webhook can recover a payment whose
    // browser verification round-trip failed, provided we can attribute the
    // provider payment to an application order. Attribution uses the Razorpay
    // order id recorded on the Order at checkout initiation; this is the same
    // authoritative mapping the verification route enforces.
    if (signatureVerified && providerPaymentId && paymentEntity?.order_id) {
      const order = await prisma.order.findFirst({
        where: { razorpayOrderId: paymentEntity.order_id },
        select: { id: true, merchantId: true, totalMinor: true, currency: true, status: true },
      });

      if (order) {
        // Guard against a concurrent browser verification having created the
        // record between our earlier lookup and here.
        const raced = await prisma.payment.findFirst({
          where: { providerPaymentId },
          select: { id: true, merchantId: true, status: true },
        });
        if (raced) {
          await prisma.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: { merchantId: raced.merchantId, status: "PROCESSED", processedAt: new Date() },
          });
          return {
            status: "PROCESSED",
            message: `Payment ${raced.id} already recorded by concurrent verification`,
            signatureVerified,
          };
        }

        const providerStatus = paymentEntity?.status;
        const nextStatus = canonicalPaymentStatus(providerStatus ?? "");

        const [createdPayment] = await prisma.$transaction([
          prisma.payment.create({
            data: {
              merchantId: order.merchantId,
              orderId: order.id,
              amountMinor: order.totalMinor,
              currency: order.currency,
              status: nextStatus,
              provider: "razorpay",
              providerPaymentId,
            },
          }),
          prisma.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: { merchantId: order.merchantId, status: "PROCESSED", processedAt: new Date() },
          }),
        ]);

        // A reconciled capture must also advance the order, exactly as the
        // browser verification path does.
        if (nextStatus === "CAPTURED") {
          await prisma.order.updateMany({
            where: { id: order.id, status: "PENDING" },
            data: { status: "CONFIRMED" },
          });
        }

        return {
          status: "PROCESSED",
          message: `Reconciled missing payment ${createdPayment.id} for order ${order.id} (${nextStatus})`,
          signatureVerified,
        };
      }
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "UNHANDLED", processedAt: new Date() },
    });
    return {
      status: "UNHANDLED",
      message: providerPaymentId
        ? `No local payment matches providerPaymentId ${providerPaymentId}`
        : "Payload contained no resolvable payment reference",
      signatureVerified,
    };
  }

  const providerStatus: string | undefined =
    paymentEntity?.status ?? payload?.payload?.refund?.entity?.status;

  if (!providerStatus) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "UNHANDLED", processedAt: new Date() },
    });
    return { status: "UNHANDLED", message: "Payload carried no payment status", signatureVerified };
  }

  const nextStatus = canonicalPaymentStatus(providerStatus);

  // Nothing to do (already correct, or a backwards transition such as a
  // replayed `failed` arriving after `captured`).
  if (!shouldApplyPaymentStatusUpdate(payment.status, nextStatus)) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    return {
      status: "PROCESSED",
      message: `No status change for payment ${payment.id} (kept ${payment.status}, incoming ${nextStatus})`,
      signatureVerified,
    };
  }

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: nextStatus },
    }),
    prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    }),
  ]);

  return {
    status: "PROCESSED",
      message: `Payment ${updatedPayment.id} moved ${payment.status} -> ${nextStatus}`,
      signatureVerified,
    };
}

export function parseWebhookPayload(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function extractPaymentFromWebhook(payload: any): any {
  return payload?.payload?.payment?.entity || null;
}

export function extractOrderFromWebhook(payload: any): any {
  return payload?.payload?.order?.entity || null;
}

export function extractRefundFromWebhook(payload: any): any {
  return payload?.payload?.refund?.entity || null;
}
