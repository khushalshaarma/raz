import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, notFoundResponse, badRequestResponse } from "@/lib/errors";
import { createAuditEvent } from "@/lib/audit";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function GET(
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
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
        payments: true,
      },
    });

    if (!order) return notFoundResponse("Order not found");

    // Also return recent audit events for this order so the UI can show history.
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        merchantId,
        resourceType: "ORDER",
        resourceId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return successResponse({ order, auditLogs });
  } catch (error) {
    console.error("Order detail error:", error);
    return errorResponse("Failed to load order");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { id } = await params;
    const body = await request.json();
    const { status } = body as { status?: string };

    if (!status) return badRequestResponse("Status is required");

    const order = await prisma.order.findFirst({ where: { id, merchantId } });
    if (!order) return notFoundResponse("Order not found");

    const allowed = STATUS_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) {
      return badRequestResponse(`Invalid status transition from ${order.status} to ${status}`);
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        items: { include: { product: { select: { name: true } } } },
        customer: { select: { name: true, email: true } },
      },
    });

    await createAuditEvent({
      merchantId,
      actorType: "MERCHANT",
      actorId: user?.userId,
      action: "ORDER_STATUS_UPDATED",
      resourceType: "ORDER",
      resourceId: id,
      metadata: { from: order.status, to: status },
      severity: "INFO",
    });

    return successResponse({ order: updated });
  } catch (error) {
    console.error("Order update error:", error);
    return errorResponse("Failed to update order");
  }
}
