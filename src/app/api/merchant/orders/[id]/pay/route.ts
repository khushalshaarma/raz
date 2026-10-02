import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, notFoundResponse, badRequestResponse } from "@/lib/errors";
import { createRazorpayOrder } from "@/lib/execution/providers/razorpay/orders";
import { getRazorpayConfig } from "@/lib/execution/providers/razorpay/config";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { id } = await params;
    const order = await prisma.order.findFirst({
      where: { id, merchantId },
      include: { payments: true },
    });

    if (!order) return notFoundResponse("Order not found");

    // Block a second payment initiation if the order already has a captured payment.
    const alreadyCaptured = order.payments.some((p) => p.status === "CAPTURED");
    if (alreadyCaptured) {
      return badRequestResponse("Order already paid");
    }

    const config = getRazorpayConfig();

    const razorpayOrder = await createRazorpayOrder({
      amountMinor: order.totalMinor,
      currency: "INR",
      receipt: order.id,
      notes: { merchantOrderId: order.id },
    });

    return successResponse({
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: config.keyId,
      orderId: order.id,
    });
  } catch (error) {
    console.error("Create Razorpay order error:", error);
    return errorResponse("Failed to initiate payment");
  }
}
