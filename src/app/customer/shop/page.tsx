"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function CustomerShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/shop/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading products...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Shop</h1>
        <p className="text-growthos-muted text-sm mt-1">Browse available products</p>
      </div>

      {products.length === 0 ? (
        <div className="text-growthos-muted text-sm">No products available.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p: any) => (
            <Link
              key={p.id}
              href={`/customer/products/${p.id}`}
              className="p-5 bg-growthos-surface border border-growthos-border rounded-xl hover:border-growthos-accent/50 transition-colors"
            >
              <div className="space-y-3">
                <div className="h-32 bg-growthos-bg rounded-lg flex items-center justify-center">
                  <span className="text-growthos-muted text-sm">{p.category}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-growthos-text">{p.name}</h3>
                  <p className="text-xs text-growthos-muted mt-1 line-clamp-2">{p.description}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-growthos-text">{formatINR(p.priceMinor)}</span>
                  <span className={`text-xs ${p.stock > 0 ? "text-green-400" : "text-red-400"}`}>
                    {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
