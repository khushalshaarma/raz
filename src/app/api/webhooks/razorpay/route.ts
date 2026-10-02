import { NextRequest, NextResponse } from "next/server";
import { processWebhookEvent, parseWebhookPayload, extractPaymentFromWebhook, extractOrderFromWebhook } from "@/lib/execution/providers/razorpay/webhooks";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";
    const eventType = request.headers.get("x-razorpay-event") || "";

    const result = await processWebhookEvent(body, signature, eventType);

    if (result.status === "REJECTED") {
      return NextResponse.json({ error: result.message }, { status: 401 });
    }

    if (result.status === "DUPLICATE") {
      return NextResponse.json({ status: "duplicate", message: result.message });
    }

    // Fail closed: every handler below mutates Execution / GovernanceDecision /
    // ActionRequest state. Those mutations must never be driven by a payload
    // that was not cryptographically verified — when RAZORPAY_WEBHOOK_SECRET is
    // unset this endpoint accepts an arbitrary body from anyone, which would
    // otherwise let a forged `captured` event mark a governance decision
    // EXECUTED.
    if (!result.signatureVerified) {
      return NextResponse.json(
        {
          status: "unverified",
          message: result.message,
          detail:
            "Event recorded but not applied: webhook signature could not be verified. Set RAZORPAY_WEBHOOK_SECRET to enable processing.",
        },
        { status: 202 }
      );
    }

    const payload = parseWebhookPayload(body);
    if (!payload) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await processPaymentEvent(payload);
    await processOrderEvent(payload);
    await processAIBuyerOutcome(payload);

    return NextResponse.json({ status: "ok", message: result.message });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function processAIBuyerOutcome(payload: any) {
  const payment = extractPaymentFromWebhook(payload);
  if (!payment) return;

  const orderId = payment.order_id;
  if (!orderId) return;

  const execution = await prisma.execution.findFirst({
    where: { providerReference: orderId },
  });

  if (!execution) return;
  if (execution.actionType !== "AI_BUYER_PURCHASE") return;

  const isSuccess = payment.status === "captured";

  await prisma.auditLog.create({
    data: {
      merchantId: execution.merchantId,
      action: "AI_BUYER_PAYMENT_" + (isSuccess ? "SUCCESS" : "FAILED"),
      resourceType: "EXECUTION",
      resourceId: execution.id,
      outcome: isSuccess ? "SUCCEEDED" : "FAILED",
      details: JSON.stringify({
        eventType: payload.event,
        paymentId: payment.id,
        paymentStatus: payment.status,
        actionType: "AI_BUYER_PURCHASE",
        amountMinor: execution.amountMinor,
      }),
      severity: isSuccess ? "INFO" : "ERROR",
    },
  });
}

async function processPaymentEvent(payload: any) {
  const payment = extractPaymentFromWebhook(payload);
  if (!payment) return;

  const orderId = payment.order_id;
  if (!orderId) return;

  const execution = await prisma.execution.findFirst({
    where: { providerReference: orderId },
  });

  if (!execution) return;

  const paymentStatus = payment.status;
  let newStatus: string;

  switch (paymentStatus) {
    case "captured":
      newStatus = "SUCCEEDED";
      break;
    case "failed":
      newStatus = "FAILED";
      break;
    case "authorized":
      newStatus = "PENDING";
      break;
    default:
      newStatus = "PENDING";
  }

  // Atomic: update execution + governance + action request + audit log
  const completedAt = newStatus === "SUCCEEDED" || newStatus === "FAILED" ? new Date() : undefined;

  await prisma.$transaction(async (tx) => {
    // Update execution status
    await tx.execution.update({
      where: { id: execution.id },
      data: {
        status: newStatus as any,
        providerReference: payment.id,
        completedAt,
        updatedAt: new Date(),
      },
    });

    // Update GovernanceDecision and ActionRequest status atomically
    if (newStatus === "SUCCEEDED") {
      await tx.governanceDecision.updateMany({
        where: { id: execution.governanceDecisionId },
        data: { executedAt: new Date(), status: "EXECUTED" },
      });
      await tx.actionRequest.updateMany({
        where: { id: execution.actionRequestId },
        data: { status: "EXECUTED" },
      });
    } else if (newStatus === "FAILED") {
      await tx.actionRequest.updateMany({
        where: { id: execution.actionRequestId },
        data: { status: "EXPIRED", reason: `Execution failed: ${paymentStatus}` },
      });
    }

    // Create audit event
    await tx.auditLog.create({
      data: {
        merchantId: execution.merchantId,
        action: "WEBHOOK_RECEIVED",
        resourceType: "EXECUTION",
        resourceId: execution.id,
        outcome: newStatus,
        details: JSON.stringify({
          eventType: payload.event,
          paymentId: payment.id,
          paymentStatus,
          newStatus,
        }),
        severity: newStatus === "FAILED" ? "ERROR" : "INFO",
      },
    });
  });
}

async function processOrderEvent(payload: any) {
  const order = extractOrderFromWebhook(payload);
  if (!order) return;

  const execution = await prisma.execution.findFirst({
    where: { providerReference: order.id },
  });

  if (!execution) return;

  await prisma.auditLog.create({
    data: {
      merchantId: execution.merchantId,
      action: "ORDER_WEBHOOK_RECEIVED",
      resourceType: "EXECUTION",
      resourceId: execution.id,
      outcome: order.status || "UNKNOWN",
      details: JSON.stringify({
        eventType: payload.event,
        orderId: order.id,
        orderStatus: order.status,
      }),
      severity: "INFO",
    },
  });
}
