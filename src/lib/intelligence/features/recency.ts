/**
 * Recency feature: days since customer's most recent completed order
 * Formula: days_between(now(), last_completed_order_date)
 * Data Source: Order table — most recent order WHERE customerId AND status = COMPLETED
 * Purpose: Core RFM dimension — recency is the strongest predictor of repeat buying
 */

import { prisma } from "@/lib/prisma";

export interface RecencyFeatures {
  recencyDays: number;
  daysSincePreviousPurchase?: number;
}

/**
 * Get recency features for a single customer
 */
export async function getCustomerRecency(customerId: string, merchantId: string): Promise<RecencyFeatures> {
  const lastOrder = await prisma.order.findFirst({
    where: {
      customerId,
      merchantId,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      totalMinor: true,
    },
  });

  if (!lastOrder) {
    return { recencyDays: 9999, daysSincePreviousPurchase: undefined };
  }

  const now = new Date();
  const diffMs = now.getTime() - lastOrder.createdAt.getTime();
  const recencyDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  // Days since previous purchase
  const prevOrder = await prisma.order.findFirst({
    where: {
      customerId,
      merchantId,
      status: "COMPLETED",
      createdAt: {
        lt: lastOrder.createdAt,
      },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const daysSincePreviousPurchase =
    prevOrder
      ? Math.max(
          0,
          Math.floor(
            (lastOrder.createdAt.getTime() - prevOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          )
        )
      : undefined;

  return { recencyDays, daysSincePreviousPurchase };
}

/**
 * Get recency features for all customers of a merchant
 */
export async function getMerchantRecencyFeatures(merchantId: string): Promise<Array<{
  customerId: string;
  recencyDays: number;
  daysSincePreviousPurchase?: number;
}>> {
  const customers = await prisma.customer.findMany({
    where: { merchantId },
    select: { id: true },
  });

  const features = await Promise.all(
    customers.map((c) => getCustomerRecency(c.id, merchantId))
  );

  return features.map((f, i) => ({
    customerId: customers[i].id,
    recencyDays: f.recencyDays,
    daysSincePreviousPurchase: f.daysSincePreviousPurchase,
  }));
}