import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/product/format";

/**
 * Monetary feature: total spend across all completed orders in paise
 * Formula: sum(amountMinor of completed_orders)
 * Data Source: Order table — WHERE customerId = ? AND status = COMPLETED,
 *   sum the amountMinor of associated payments, or derive from totalMinor on the order
 * Purpose: Core RFM dimension — total monetary value of the customer relationship
 *
 * All monetary values are in integer paise (1 rupee = 100 paise).
 * No floating-point arithmetic is used for monetary calculations.
 * formatMoney is for UI display only.
 */

/**
 * Get monetary features for a single customer
 */
export interface MonetaryFeatures {
  monetaryTotal: number;
  averageOrderValue: number;
  monetaryPerMonth: number;
}

/**
 * Extract amountMinor from order's payments or fall back to totalMinor
 */
function extractAmountMinor(order: { Payments?: any[]; totalMinor?: number }): number {
  if (order.Payments && order.Payments.length > 0) {
    return order.Payments[0].amountMinor;
  }
  return order.totalMinor || 0;
}

/**
 * Get monetary features for a single customer
 */
export async function getCustomerMonetary(customerId: string, merchantId: string): Promise<MonetaryFeatures> {
  const completedOrders = await prisma.order.findMany({
    where: {
      customerId,
      merchantId,
      status: "COMPLETED",
    },
    include: { payments: true },
    orderBy: { createdAt: "desc" },
  });

  const monetaryTotal = completedOrders.reduce((sum, order) => {
    return sum + extractAmountMinor(order as any);
  }, 0);

  const frequencyTotal = completedOrders.length;
  const averageOrderValue = frequencyTotal > 0 ? monetaryTotal / frequencyTotal : 0;

  // First order date for tenure calculation
  const firstOrder = await prisma.order.findFirst({
    where: {
      customerId,
      merchantId,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const firstOrderDate = firstOrder?.createdAt ?? new Date();
  const now = new Date();
  const monthsSinceFirst = Math.max(
    1,
    Math.ceil((now.getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
  );

  const monetaryPerMonth = monetaryTotal / monthsSinceFirst;

  return {
    monetaryTotal,
    averageOrderValue: Math.round(averageOrderValue),
    monetaryPerMonth: Math.round(monetaryPerMonth),
  };
}

/**
 * Get monetary features for all customers of a merchant
 */
export async function getMerchantMonetaryFeatures(merchantId: string): Promise<Array<{
  customerId: string;
  monetaryTotal: number;
  averageOrderValue: number;
  monetaryPerMonth: number;
}>> {
  const customers = await prisma.customer.findMany({
    where: { merchantId },
    select: { id: true },
  });

  const features = await Promise.all(
    customers.map((c) => getCustomerMonetary(c.id, merchantId))
  );

  return features.map((f, i) => ({
    customerId: customers[i].id,
    monetaryTotal: f.monetaryTotal,
    averageOrderValue: f.averageOrderValue,
    monetaryPerMonth: f.monetaryPerMonth,
  }));
}