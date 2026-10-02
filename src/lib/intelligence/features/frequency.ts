/**
 * Frequency feature: total completed orders for a customer
 * Formula: count(completed_orders WHERE customerId = ?)
 * Data Source: Order table — WHERE customerId = ? AND status = COMPLETED
 * Purpose: Core RFM dimension — how often the customer buys
 */

import { prisma } from "@/lib/prisma";

export interface FrequencyFeatures {
  frequencyTotal: number;
  purchaseFrequencyPerMonth: number;
  daysSinceFirstPurchase: number;
}

/**
 * Get frequency features for a single customer
 */
export async function getCustomerFrequency(customerId: string, merchantId: string): Promise<FrequencyFeatures> {
  const completedOrders = await prisma.order.count({
    where: {
      customerId,
      merchantId,
      status: "COMPLETED",
    },
  });

  // First order date
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

  // Purchase frequency per month
  const purchaseFrequencyPerMonth = completedOrders / monthsSinceFirst;

  return {
    frequencyTotal: completedOrders,
    purchaseFrequencyPerMonth,
    daysSinceFirstPurchase: Math.floor((now.getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24)),
  };
}

/**
 * Get frequency features for all customers of a merchant
 */
export async function getMerchantFrequencyFeatures(merchantId: string): Promise<Array<{
  customerId: string;
  frequencyTotal: number;
  purchaseFrequencyPerMonth: number;
  daysSinceFirstPurchase: number;
}>> {
  const customers = await prisma.customer.findMany({
    where: { merchantId },
    select: { id: true },
  });

  const features = await Promise.all(
    customers.map((c) => getCustomerFrequency(c.id, merchantId))
  );

  return features.map((f, i) => ({
    customerId: customers[i].id,
    frequencyTotal: f.frequencyTotal,
    purchaseFrequencyPerMonth: f.purchaseFrequencyPerMonth,
    daysSinceFirstPurchase: f.daysSinceFirstPurchase,
  }));
}