import { prisma } from "@/lib/prisma";

export interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  customerCount: number;
  revenue: number;
  formattedRevenue: string;
  averageOrderValue: number;
  purchaseFrequency: number;
  recency: number;
  trend: "GROWING" | "STABLE" | "DECLINING";
}

export async function getCustomerSegments(merchantId: string): Promise<CustomerSegment[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const customers = await prisma.customer.findMany({
    where: { merchantId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          totalMinor: true,
          createdAt: true,
        },
      },
    },
  });

  const segments: Record<string, {
    customers: typeof customers;
    revenue: number;
    orderCount: number;
  }> = {
    HIGH_VALUE_LOYAL: { customers: [], revenue: 0, orderCount: 0 },
    HIGH_VALUE_INACTIVE: { customers: [], revenue: 0, orderCount: 0 },
    ACTIVE_GROWING: { customers: [], revenue: 0, orderCount: 0 },
    NEW_CUSTOMER: { customers: [], revenue: 0, orderCount: 0 },
    LOW_ENGAGEMENT: { customers: [], revenue: 0, orderCount: 0 },
    AT_RISK: { customers: [], revenue: 0, orderCount: 0 },
  };

  for (const customer of customers) {
    const totalSpend = customer.orders.reduce((sum, o) => sum + o.totalMinor, 0);
    const orderCount = customer.orders.length;
    const lastOrder = customer.orders[0];
    const daysSinceLastOrder = lastOrder
      ? Math.floor((Date.now() - new Date(lastOrder.createdAt).getTime()) / 86400000)
      : 999;
    const daysSinceFirst = customer.orders.length > 1
      ? Math.floor((Date.now() - new Date(customer.orders[customer.orders.length - 1].createdAt).getTime()) / 86400000)
      : daysSinceLastOrder;

    let segment = "LOW_ENGAGEMENT";
    if (orderCount >= 5 && totalSpend >= 500000 && daysSinceLastOrder < 30) {
      segment = "HIGH_VALUE_LOYAL";
    } else if (orderCount >= 3 && totalSpend >= 500000 && daysSinceLastOrder >= 45) {
      segment = "HIGH_VALUE_INACTIVE";
    } else if (orderCount >= 2 && daysSinceLastOrder < 30) {
      segment = "ACTIVE_GROWING";
    } else if (orderCount <= 2 && daysSinceFirst < 30) {
      segment = "NEW_CUSTOMER";
    } else if (daysSinceLastOrder >= 60 && orderCount >= 2) {
      segment = "AT_RISK";
    } else if (orderCount <= 1 && daysSinceLastOrder >= 30) {
      segment = "LOW_ENGAGEMENT";
    }

    segments[segment].customers.push(customer);
    segments[segment].revenue += totalSpend;
    segments[segment].orderCount += orderCount;
  }

  const result: CustomerSegment[] = Object.entries(segments).map(([key, data]) => {
    const count = data.customers.length;
    const aov = data.orderCount > 0 ? Math.round(data.revenue / data.orderCount) : 0;
    const frequency = count > 0 ? data.orderCount / count : 0;

    return {
      id: key,
      name: key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      description: getSegmentDescription(key),
      customerCount: count,
      revenue: data.revenue,
      formattedRevenue: `₹${(data.revenue / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      averageOrderValue: aov,
      purchaseFrequency: Math.round(frequency * 10) / 10,
      recency: 0,
      trend: count > 0 ? "STABLE" : "DECLINING",
    };
  });

  return result.filter(s => s.customerCount > 0);
}

function getSegmentDescription(key: string): string {
  switch (key) {
    case "HIGH_VALUE_LOYAL": return "Top customers who purchase frequently and spend the most";
    case "HIGH_VALUE_INACTIVE": return "Previously valuable customers who haven't purchased recently";
    case "ACTIVE_GROWING": return "Customers with increasing purchase frequency";
    case "NEW_CUSTOMER": return "Recently acquired customers with few purchases";
    case "LOW_ENGAGEMENT": return "Customers with minimal purchase activity";
    case "AT_RISK": return "Customers who haven't purchased in 60+ days";
    default: return "";
  }
}
