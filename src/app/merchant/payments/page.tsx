"use client";

import { useEffect, useState } from "react";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function MerchantPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/payments")
      .then((r) => r.json())
      .then((d) => setPayments(d.payments || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Payments</h1>
        <p className="text-growthos-muted text-sm mt-1">Payment history and status</p>
      </div>

      {payments.length === 0 ? (
        <div className="text-growthos-muted text-sm">No payments yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-growthos-border text-growthos-muted">
                <th className="text-left py-3 px-4">Payment ID</th>
                <th className="text-left py-3 px-4">Order</th>
                <th className="text-left py-3 px-4">Amount</th>
                <th className="text-left py-3 px-4">Provider</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                  <td className="py-3 px-4 text-growthos-text font-mono text-xs">{p.id.slice(0, 8)}</td>
                  <td className="py-3 px-4 text-growthos-muted font-mono text-xs">{p.orderId?.slice(0, 8)}</td>
                  <td className="py-3 px-4 text-growthos-text">{formatINR(p.amountMinor)}</td>
                  <td className="py-3 px-4 text-growthos-muted capitalize">{p.provider}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.status === "CAPTURED" ? "bg-green-500/10 text-green-400" :
                      p.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" :
                      p.status === "FAILED" ? "bg-red-500/10 text-red-400" :
                      p.status === "REFUNDED" ? "bg-purple-500/10 text-purple-400" :
                      "bg-gray-500/10 text-gray-400"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-growthos-muted">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
