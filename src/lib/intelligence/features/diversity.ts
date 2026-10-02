/**
 * Diversity feature: product categories the customer prefers
 * Formula: modes([product.category ORDER BY count(*) DESC])
 *   FROM order_items JOIN products ON order_items.productId = products.id
 *   WHERE order.order.customerId = ? AND order.status = COMPLETED
 * Data Source: OrderItem JOIN Product — the customer's completed orders' products' categories
 * Purpose: Enables category-specific recommendations (upsell/cross-sell within preferred categories)
 *
 * All category names are taken directly from the Product model's `category` field.
 * The mode is the most frequently purchased category. If there are ties, all top categories are returned.
 */
import { prisma } from "@/lib/prisma";

export interface DiversityFeatures {
  categoryAffinity: string[];
  productCount: number;
}

/**
 * Get diversity features for a single customer
 */
export async function getCustomerDiversity(customerId: string, merchantId: string): Promise<DiversityFeatures> {
  // Tagged template rather than `$executeRawUnsafe`: this is a SELECT, so it
  // must use `$queryRaw` (`$executeRaw` returns an affected-row count, not rows,
  // which is why the parsed array was always empty), and the tagged form binds
  // the values as parameters instead of splicing them into the SQL text.
  const rows = await prisma.$queryRaw<{ category: string; cnt: number }[]>`
    SELECT p.category, COUNT(*) as cnt
    FROM "OrderItem" oi
    JOIN "Product" p ON oi."productId" = p."id"
    JOIN "Order" o ON oi."orderId" = o."id"
    WHERE o."customerId" = ${customerId}
      AND o."merchantId" = ${merchantId}
      AND o.status = 'COMPLETED'
    GROUP BY p.category
    ORDER BY cnt DESC
  `;

  let categories: string[] = rows
    .map((row) => (row?.category ?? "").trim())
    .filter((c) => c.length > 0);
  let productCount = rows.length;

  // If no categories found, return empty
  if (categories.length === 0) {
    categories = ["General"];
    productCount = 0;
  }

  return { categoryAffinity: categories, productCount };
}

/**
 * Get diversity features for all customers of a merchant
 */
export async function getMerchantDiversityFeatures(merchantId: string): Promise<Array<{
  customerId: string;
  categoryAffinity: string[];
  productCount: number;
}>> {
  const customers = await prisma.customer.findMany({
    where: { merchantId },
    select: { id: true },
  });

  const features = await Promise.all(
    customers.map((c) => getCustomerDiversity(c.id, merchantId))
  );

  return features.map((f, i) => ({
    customerId: customers[i].id,
    categoryAffinity: f.categoryAffinity,
    productCount: f.productCount,
  }));
}