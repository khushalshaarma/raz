"use client";

import { useEffect, useState } from "react";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customer/orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading orders...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">My Orders</h1>
        <p className="text-growthos-muted text-sm mt-1">View your order history</p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-growthos-muted">No orders yet.</div>
          <p className="text-sm text-growthos-muted mt-2">
            Start shopping to see your orders here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o: any) => (
            <div key={o.id} className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-mono text-growthos-muted">Order #{o.id.slice(0, 8)}</div>
                  <div className="text-xs text-growthos-muted mt-1">{new Date(o.createdAt).toLocaleDateString("en-IN")}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  o.status === "COMPLETED" ? "bg-green-500/10 text-green-400" :
                  o.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" :
                  o.status === "CANCELLED" ? "bg-red-500/10 text-red-400" :
                  "bg-blue-500/10 text-blue-400"
                }`}>
                  {o.status}
                </span>
              </div>

              <div className="space-y-2">
                {o.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-growthos-text">
                      {item.product?.name} × {item.quantity}
                    </span>
                    <span className="text-growthos-text">{formatINR(item.totalMinor)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-growthos-border/50 flex justify-between">
                <span className="text-sm text-growthos-muted">Total</span>
                <span className="text-lg font-bold text-growthos-text">{formatINR(o.totalMinor)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
