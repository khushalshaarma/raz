import { prisma } from "@/lib/prisma";
import { getRazorpayConfig } from "@/lib/execution/providers/razorpay/config";
import { createRazorpayOrder } from "@/lib/execution/providers/razorpay/orders";
import { createExecutionIdempotencyRecord } from "@/lib/execution/idempotency";
import { recordExecutionEvent, updateExecutionStatus } from "@/lib/execution/result";
import type { CheckoutInput, CheckoutResult } from "./types";

export async function createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const { proposalId, merchantId } = input;
  const checkoutId = `chk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  try {
    const actionRequest = await prisma.actionRequest.findUnique({
      where: { id: proposalId },
    });

    if (!actionRequest) {
      return { success: false, checkoutId, status: "NOT_FOUND", error: "Proposal not found" };
    }

    if (actionRequest.merchantId !== merchantId) {
      return { success: false, checkoutId, status: "MERCHANT_ISOLATION", error: "Merchant isolation violation" };
    }

    if (actionRequest.status !== "APPROVED") {
      return { success: false, checkoutId, status: "NOT_APPROVED", error: "Proposal not approved" };
    }

    const evidence = actionRequest.evidence ? JSON.parse(actionRequest.evidence) : {};
    const productId = evidence.productId || actionRequest.strategyId;
    const quantity = evidence.quantity || 1;
    const proposalTotal = evidence.totalAmount || 0;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.merchantId !== merchantId) {
      return { success: false, checkoutId, status: "PRODUCT_INVALID", error: "Product not found or ownership mismatch" };
    }

    if (!product.active) {
      return { success: false, checkoutId, status: "PRODUCT_INACTIVE", error: "Product is no longer active" };
    }

    if (product.stock < quantity) {
      return { success: false, checkoutId, status: "INSUFFICIENT_INVENTORY", error: "Insufficient inventory" };
    }

    const serverTotal = Math.round(product.priceMinor / 100 * quantity * 100) / 100;
    const amountMinor = Math.round(serverTotal * 100);

    if (Math.abs(proposalTotal - serverTotal) > 0.01) {
      return {
        success: false,
        checkoutId,
        status: "PRICE_CHANGED",
        error: `Price changed: proposal was ₹${proposalTotal}, current price is ₹${serverTotal}`,
        amount: serverTotal,
        currency: product.currency,
      };
    }

    const idempotencyResult = await createExecutionIdempotencyRecord(
      merchantId,
      checkoutId,
      `ai-buyer-${proposalId}`
    );

    if (!idempotencyResult.isNew) {
      return { success: false, checkoutId, status: "ALREADY_PROCESSED", error: "Checkout already processed" };
    }

    const config = getRazorpayConfig();

    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrder({
        amountMinor,
        currency: product.currency,
        receipt: `ai-buyer-${checkoutId}`,
        notes: {
          growthosCheckoutId: checkoutId,
          proposalId,
          actionRequestId: proposalId,
          merchantId,
          productId,
        },
      });
    } catch (error: any) {
      await prisma.actionRequest.update({
        where: { id: proposalId },
        data: { status: "EXPIRED", reason: `Razorpay order creation failed: ${error.message}` },
      });
      return { success: false, checkoutId, status: "RAZORPAY_ERROR", error: "Failed to create Razorpay order" };
    }

    const execution = await prisma.execution.create({
      data: {
        id: checkoutId,
        merchantId,
        governanceDecisionId: actionRequest.id,
        actionRequestId: proposalId,
        idempotencyKey: `ai-buyer-${proposalId}`,
        actionType: "AI_BUYER_PURCHASE",
        strategyId: proposalId,
        amountMinor,
        currency: product.currency,
        status: "CREATED",
        provider: "razorpay",
        providerReference: razorpayOrder.id,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    await prisma.actionRequest.update({
      where: { id: proposalId },
      data: { status: "PENDING" },
    });

    await updateExecutionStatus(checkoutId, "PREFLIGHT");

    await recordExecutionEvent(checkoutId, "CHECKOUT_INITIALIZED", {
      merchantId,
      razorpayOrderId: razorpayOrder.id,
      amountMinor,
    });

    return {
      success: true,
      checkoutId,
      status: "CHECKOUT_READY",
      orderId: execution.id,
      razorpayOrderId: razorpayOrder.id,
      amount: serverTotal,
      currency: product.currency,
      keyId: config.keyId,
    };
  } catch (error: any) {
    console.error("Checkout error:", error);
    return { success: false, checkoutId, status: "ERROR", error: "Checkout processing failed" };
  }
}

export async function confirmCheckout(checkoutId: string, merchantId: string): Promise<CheckoutResult> {
  const execution = await prisma.execution.findUnique({
    where: { id: checkoutId },
  });

  if (!execution || execution.merchantId !== merchantId) {
    return { success: false, checkoutId, status: "NOT_FOUND", error: "Checkout not found" };
  }

  if (execution.status === "SUCCEEDED") {
    return { success: true, checkoutId, status: "ALREADY_SUCCEEDED" };
  }

  if (execution.status === "FAILED" || execution.status === "CANCELLED" || execution.status === "EXPIRED") {
    return { success: false, checkoutId, status: execution.status, error: `Payment ${execution.status}` };
  }

  return { success: true, checkoutId, status: execution.status };
}

export async function getCheckoutStatus(checkoutId: string, merchantId: string) {
  const execution = await prisma.execution.findUnique({
    where: { id: checkoutId },
    include: { actionRequest: true },
  });

  if (!execution || execution.merchantId !== merchantId) return null;

  return {
    checkoutId,
    status: execution.status,
    amount: execution.amountMinor / 100,
    currency: execution.currency,
    providerReference: execution.providerReference,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    actionStatus: execution.actionRequest?.status,
  };
}