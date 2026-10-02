import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, badRequestResponse } from "@/lib/errors";
import { createAuditEvent } from "@/lib/audit";
import { getRazorpayConfig } from "@/lib/execution/providers/razorpay/config";
import { fetchRazorpayPayment } from "@/lib/execution/providers/razorpay/payments";
import { fetchRazorpayOrder } from "@/lib/execution/providers/razorpay/orders";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const payments = await prisma.payment.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      include: {
        order: { select: { id: true, status: true } },
      },
    });

    return successResponse({ payments });
  } catch (error) {
    console.error("Payments error:", error);
    return errorResponse("Failed to load payments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body");
    }

    const {
      merchantOrderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = body as Record<string, string | undefined>;

    if (!merchantOrderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          code: "MISSING_FIELDS",
          retryable: false,
        },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
      where: { id: merchantOrderId, merchantId },
    });
    if (!order) {
      return badRequestResponse("Invalid order");
    }

    const config = getRazorpayConfig();

    // Verify the Razorpay checkout signature. This is HMAC-SHA256 of
    // "order_id|payment_id" keyed with the server-side key secret. This is the
    // authoritative proof that the success callback came from Razorpay and was
    // not forged by the client.
    const expected = crypto
      .createHmac("sha256", config.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    const providedBuf = Buffer.from(razorpaySignature);
    const expectedBuf = Buffer.from(expected);
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return NextResponse.json(
        { error: "Invalid payment signature", code: "INVALID_SIGNATURE", retryable: false },
        { status: 400 }
      );
    }

    // Fetch the Razorpay order to confirm it was actually minted for THIS
    // application order. Without this check a payment for a different order of
    // the same amount could be attached to this order.
    const razorpayOrder = await fetchRazorpayOrder(razorpayOrderId);
    const mappedRazorpayOrderId = order.razorpayOrderId;
    if (
      mappedRazorpayOrderId &&
      mappedRazorpayOrderId !== razorpayOrderId
    ) {
      return NextResponse.json(
        { error: "Razorpay order does not match this order", code: "ORDER_MAPPING_MISMATCH", retryable: false },
        { status: 400 }
      );
    }
    if (razorpayOrder.receipt && razorpayOrder.receipt !== order.id) {
      return NextResponse.json(
        { error: "Razorpay order receipt does not match this order", code: "ORDER_MAPPING_MISMATCH", retryable: false },
        { status: 400 }
      );
    }

    // Fetch the payment from Razorpay to confirm its order, amount, currency and
    // status. Never trust the client's callback values for money fields.
    const payment = await fetchRazorpayPayment(razorpayPaymentId);
    if (payment.orderId !== razorpayOrderId) {
      return NextResponse.json(
        { error: "Payment does not belong to this Razorpay order", code: "PAYMENT_ORDER_MISMATCH", retryable: false },
        { status: 400 }
      );
    }
    if (payment.amount !== order.totalMinor) {
      return NextResponse.json(
        { error: "Amount mismatch", code: "AMOUNT_MISMATCH", retryable: false },
        { status: 400 }
      );
    }
    if (payment.currency !== order.currency) {
      return NextResponse.json(
        { error: "Currency mismatch", code: "CURRENCY_MISMATCH", retryable: false },
        { status: 400 }
      );
    }

    const canonicalStatus = canonicalizeProviderStatus(payment.status);
    // Only a captured payment may advance the order. An authorized (uncaptured)
    // or failed payment must not be treated as paid.
    const isCaptured = canonicalStatus === "CAPTURED";

    // Idempotency: if this provider payment is already recorded, reconcile the
    // order state (in case a previous request persisted the payment but failed
    // before advancing the order) and return the existing record.
    const existing = await prisma.payment.findFirst({
      where: { providerPaymentId: razorpayPaymentId },
    });
    if (existing) {
      if (isCaptured) {
        await advanceOrderForCapturedPayment(order.id, existing.status);
      }
      return successResponse({
        payment: existing,
        duplicate: true,
        verified: isCaptured,
        captured: isCaptured,
        orderStatus: isCaptured ? await currentOrderStatus(order.id) : undefined,
      });
    }

    const newPayment = await prisma.payment.create({
      data: {
        merchantId,
        orderId: order.id,
        amountMinor: order.totalMinor,
        currency: order.currency,
        status: canonicalStatus,
        provider: "razorpay",
        providerPaymentId: razorpayPaymentId,
      },
    });

    await createAuditEvent({
      merchantId,
      actorType: "MERCHANT",
      actorId: user?.userId,
      action: "PAYMENT_RECORDED",
      resourceType: "PAYMENT",
      resourceId: newPayment.id,
      metadata: { orderId: order.id, providerPaymentId: razorpayPaymentId, status: newPayment.status },
      severity: "INFO",
    });

    if (!isCaptured) {
      // Payment verified as genuine but not captured: recorded, order NOT marked
      // paid. Return a non-success status so the client shows the true state.
      return NextResponse.json(
        {
          payment: newPayment,
          verified: true,
          captured: false,
          code: "PAYMENT_NOT_CAPTURED",
          message: `Payment status is ${newPayment.status}, not captured`,
        },
        { status: 200 }
      );
    }

    await advanceOrderForCapturedPayment(order.id, newPayment.status);

    return successResponse({
      payment: newPayment,
      duplicate: false,
      verified: true,
      captured: true,
      orderStatus: await currentOrderStatus(order.id),
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    // Distinguish a transport/provider outage (retryable) from a hard
    // validation failure so the client can offer a safe retry instead of making
    // the customer pay again.
    return NextResponse.json(
      {
        error: "Payment verification failed",
        code: "VERIFICATION_UNAVAILABLE",
        retryable: true,
      },
      { status: 503 }
    );
  }
}

function canonicalizeProviderStatus(providerStatus: string): string {
  switch (providerStatus.trim().toUpperCase()) {
    case "CAPTURED":
      return "CAPTURED";
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "FAILED":
      return "FAILED";
    case "REFUNDED":
      return "REFUNDED";
    case "CREATED":
      return "CREATED";
    default:
      return "PENDING";
  }
}

/**
 * Advance an order to CONFIRMED once a payment is captured.
 *
 * Idempotent: only moves an order that is still PENDING, so a repeated
 * verification or a replayed webhook cannot regress a further-along order.
 */
async function advanceOrderForCapturedPayment(orderId: string, paymentStatus: string) {
  if (paymentStatus !== "CAPTURED") return;
  await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "CONFIRMED" },
  });
}

async function currentOrderStatus(orderId: string): Promise<string | undefined> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  return order?.status;
}