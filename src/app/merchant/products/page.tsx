"use client";

import { useEffect, useState } from "react";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function MerchantProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Products</h1>
        <p className="text-growthos-muted text-sm mt-1">Manage your product catalog</p>
      </div>

      {products.length === 0 ? (
        <div className="text-growthos-muted text-sm">No products yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-growthos-border text-growthos-muted">
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">SKU</th>
                <th className="text-left py-3 px-4">Category</th>
                <th className="text-left py-3 px-4">Price</th>
                <th className="text-left py-3 px-4">Stock</th>
                <th className="text-left py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => (
                <tr key={p.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                  <td className="py-3 px-4 text-growthos-text font-medium">{p.name}</td>
                  <td className="py-3 px-4 text-growthos-muted font-mono text-xs">{p.sku}</td>
                  <td className="py-3 px-4 text-growthos-muted">{p.category}</td>
                  <td className="py-3 px-4 text-growthos-text">{formatINR(p.priceMinor)}</td>
                  <td className="py-3 px-4 text-growthos-text">{p.stock}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.active ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                    }`}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
