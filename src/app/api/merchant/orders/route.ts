import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, badRequestResponse } from "@/lib/errors";
import { createAuditEvent } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const orders = await prisma.order.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, email: true } },
        payments: true,
        items: {
          include: { product: { select: { name: true } } },
        },
      },
    });

    return successResponse({ orders });
  } catch (error) {
    console.error("Orders error:", error);
    return errorResponse("Failed to load orders");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const body = await request.json();

    const { customerId, items, discountMinor = 0, notes, status = "PENDING" } = body as {
      customerId?: string;
      items?: Array<{ productId: string; quantity: number }>;
      discountMinor?: number;
      notes?: string;
      status?: string;
    };

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return badRequestResponse("customerId and non-empty items are required");
    }

    if (typeof discountMinor !== "number" || discountMinor < 0 || !Number.isInteger(discountMinor)) {
      return badRequestResponse("discountMinor must be a non-negative integer");
    }

    const allowedStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
    if (typeof status !== "string" || !allowedStatuses.includes(status)) {
      return badRequestResponse("Invalid order status");
    }

    const customer = await prisma.customer.findFirst({ where: { id: customerId, merchantId } });
    if (!customer) return badRequestResponse("Invalid customer");

    let subtotalMinor = 0;
    const itemCreates = [] as Array<{
      productId: string;
      quantity: number;
      priceMinor: number;
      totalMinor: number;
    }>;

    for (const item of items) {
      const quantity = Number(item.quantity);
      if (typeof item.productId !== "string" || typeof quantity !== "number" || quantity <= 0 || !Number.isInteger(quantity)) {
        return badRequestResponse("Invalid line item");
      }
      const product = await prisma.product.findFirst({ where: { id: item.productId, merchantId } });
      if (!product) return badRequestResponse("Invalid product");
      if (quantity > product.stock) {
        return badRequestResponse(`Insufficient stock for ${product.name}`);
      }
      const lineTotal = product.priceMinor * quantity;
      subtotalMinor += lineTotal;
      itemCreates.push({ productId: product.id, quantity, priceMinor: product.priceMinor, totalMinor: lineTotal });
    }

    const totalMinor = subtotalMinor - discountMinor;
    if (totalMinor < 0) return badRequestResponse("Discount cannot exceed subtotal");

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          merchantId,
          customerId,
          status,
          currency: "INR",
          subtotalMinor,
          discountMinor,
          totalMinor,
          items: { create: itemCreates },
        },
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { name: true, email: true } },
        },
      });

      // Optional: decrement stock on successful order creation
      for (const it of itemCreates) {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { decrement: it.quantity } },
        });
      }

      return created;
    });

    await createAuditEvent({
      merchantId,
      actorType: "MERCHANT",
      actorId: user?.userId,
      action: "ORDER_CREATED",
      resourceType: "ORDER",
      resourceId: order.id,
      metadata: { customerId, itemCount: items.length, subtotalMinor, discountMinor, totalMinor },
      severity: "INFO",
    });

    return successResponse({ order });
  } catch (error) {
    console.error("Create order error:", error);
    return errorResponse("Failed to create order");
  }
}
