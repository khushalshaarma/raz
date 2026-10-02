"use client";

import { useEffect, useState } from "react";

export default function MerchantCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Customers</h1>
        <p className="text-growthos-muted text-sm mt-1">View your customer base</p>
      </div>

      {customers.length === 0 ? (
        <div className="text-growthos-muted text-sm">No customers yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-growthos-border text-growthos-muted">
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Phone</th>
                <th className="text-left py-3 px-4">Orders</th>
                <th className="text-left py-3 px-4">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c: any) => (
                <tr key={c.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                  <td className="py-3 px-4 text-growthos-text">{c.name}</td>
                  <td className="py-3 px-4 text-growthos-muted">{c.email}</td>
                  <td className="py-3 px-4 text-growthos-muted">{c.phone || "—"}</td>
                  <td className="py-3 px-4 text-growthos-text">{c._count?.orders ?? 0}</td>
                  <td className="py-3 px-4 text-growthos-muted">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
