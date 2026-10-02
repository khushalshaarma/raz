import { prisma } from "@/lib/prisma";
import type { AICatalogProduct, AICatalogResponse, AIBuyerConstraint } from "./types";

export function mapProductToCatalogProduct(product: {
  id: string;
  name: string;
  description: string;
  category: string;
  priceMinor: number;
  currency: string;
  stock: number;
  sku: string;
}): AICatalogProduct {
  const inventory = product.stock;
  const availability: AICatalogProduct["availability"] =
    inventory > 10 ? "in_stock" : inventory > 0 ? "low_stock" : "out_of_stock";

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.priceMinor / 100,
    currency: product.currency,
    availability,
    inventory,
    attributes: {
      sku: product.sku,
      category: product.category,
    },
    purchase: {
      supportsCheckout: true,
      paymentMethods: ["razorpay"],
    },
  };
}

export function filterCatalog(
  products: AICatalogProduct[],
  constraints: AIBuyerConstraint
): AICatalogProduct[] {
  let filtered = products;

  if (constraints.search) {
    const search = constraints.search.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
    );
  }

  if (constraints.category) {
    const cat = constraints.category.toLowerCase();
    filtered = filtered.filter((p) => p.category.toLowerCase().includes(cat));
  }

  if (constraints.minPrice !== undefined) {
    filtered = filtered.filter((p) => p.price >= constraints.minPrice!);
  }

  if (constraints.maxPrice !== undefined) {
    filtered = filtered.filter((p) => p.price <= constraints.maxPrice!);
  }

  if (constraints.inStockOnly) {
    filtered = filtered.filter((p) => p.availability !== "out_of_stock");
  }

  if (constraints.attributes) {
    for (const [key, value] of Object.entries(constraints.attributes)) {
      filtered = filtered.filter((p) => p.attributes[key]?.toLowerCase() === value.toLowerCase());
    }
  }

  if (constraints.limit) {
    filtered = filtered.slice(0, constraints.limit);
  }

  return filtered;
}

export async function getAICatalog(
  merchantId: string,
  constraints?: AIBuyerConstraint
): Promise<AICatalogResponse> {
  const where: Record<string, unknown> = { merchantId, active: true };

  if (constraints?.category) {
    where.category = { contains: constraints.category };
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const catalogProducts = products.map(mapProductToCatalogProduct);

  const filtered = constraints ? filterCatalog(catalogProducts, constraints) : catalogProducts;

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, businessName: true, currency: true },
  });

  return {
    catalogVersion: "1",
    merchant: {
      id: merchantId,
      name: merchant?.businessName || "Unknown Merchant",
      currency: merchant?.currency || "INR",
    },
    currency: merchant?.currency || "INR",
    products: filtered,
  };
}

export function validateCatalogProduct(
  catalog: AICatalogResponse,
  productId: string
): AICatalogProduct | null {
  return catalog.products.find((p) => p.id === productId) || null;
}