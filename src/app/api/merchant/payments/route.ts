import { NextRequest } from "next/server";
import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, badRequestResponse } from "@/lib/errors";
import { createAuditEvent } from "@/lib/audit";
import { getRazorpayConfig } from "@/lib/execution/providers/razorpay/config";
import { fetchRazorpayPayment } from "@/lib/execution/providers/razorpay/payments";

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

    const body = await request.json();
    const { merchantOrderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body as {
      merchantOrderId?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    if (!merchantOrderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return badRequestResponse("Missing required fields");
    }

    const order = await prisma.order.findFirst({
      where: { id: merchantOrderId, merchantId },
    });
    if (!order) return badRequestResponse("Invalid order");

    const config = getRazorpayConfig();

    // Verify Razorpay signature (expected: HMAC SHA256 of "order_id|payment_id")
    const expected = crypto
      .createHmac("sha256", config.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (razorpay_signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(razorpay_signature), Buffer.from(expected))) {
      return badRequestResponse("Invalid signature");
    }

    // Fetch payment from Razorpay to verify details (amount, order_id, status)
    const payment = await fetchRazorpayPayment(razorpay_payment_id);
    if (payment.orderId !== razorpay_order_id) {
      return badRequestResponse("Payment detail mismatch");
    }
    if (payment.amount !== order.totalMinor) {
      return badRequestResponse("Amount mismatch");
    }

    // Idempotency: if same provider payment already recorded, return it
    const existing = await prisma.payment.findFirst({
      where: { providerPaymentId: razorpay_payment_id },
    });
    if (existing) {
      return successResponse({ payment: existing, duplicate: true });
    }

    const statusMap: Record<string, string> = {
      captured: "CAPTURED",
      authorized: "AUTHORIZED",
      failed: "FAILED",
      refunded: "REFUNDED",
    };

    const newPayment = await prisma.payment.create({
      data: {
        merchantId,
        orderId: merchantOrderId,
        amountMinor: order.totalMinor,
        currency: "INR",
        status: statusMap[payment.status] || "PENDING",
        provider: "razorpay",
        providerPaymentId: razorpay_payment_id,
      },
    });

    await createAuditEvent({
      merchantId,
      actorType: "MERCHANT",
      actorId: user?.userId,
      action: "PAYMENT_RECORDED",
      resourceType: "PAYMENT",
      resourceId: newPayment.id,
      metadata: { orderId: merchantOrderId, providerPaymentId: razorpay_payment_id, status: newPayment.status },
      severity: "INFO",
    });

    return successResponse({ payment: newPayment });
  } catch (error) {
    console.error("Payment verification error:", error);
    return errorResponse("Payment verification failed");
  }
}
