"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function CustomerProductPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/shop/products`)
      .then((r) => r.json())
      .then((d) => {
        const found = d.products?.find((p: any) => p.id === id);
        if (found) setProduct(found);
        else setError("Product not found");
      })
      .catch(() => setError("Failed to load product"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
        <Link href="/customer/shop" className="text-growthos-accent text-sm hover:underline">Back to shop</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/customer/shop" className="text-growthos-accent text-sm hover:underline">
        ← Back to shop
      </Link>

      <div className="bg-growthos-surface border border-growthos-border rounded-xl p-8">
        <div className="h-48 bg-growthos-bg rounded-lg flex items-center justify-center mb-6">
          <span className="text-growthos-muted text-lg">{product.category}</span>
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-growthos-text">{product.name}</h1>
            <p className="text-sm text-growthos-muted mt-1">SKU: {product.sku}</p>
          </div>

          <p className="text-growthos-text">{product.description}</p>

          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-bold text-growthos-text">{formatINR(product.priceMinor)}</span>
            <span className={`text-sm ${product.stock > 0 ? "text-green-400" : "text-red-400"}`}>
              {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
            </span>
          </div>

          <button
            disabled={product.stock === 0}
            className="w-full py-3 bg-growthos-accent hover:bg-growthos-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {product.stock > 0 ? "Add to Cart" : "Out of Stock"}
          </button>

          <p className="text-xs text-growthos-muted text-center">
            Payment processing will be available in Phase 5.
          </p>
        </div>
      </div>
    </div>
  );
}
