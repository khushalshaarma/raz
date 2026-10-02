"use client";

import { useEffect, useState } from "react";

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  if (error) {
    return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>;
  }

  const s = data!.stats;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Platform Overview</h1>
        <p className="text-growthos-muted text-sm mt-1">GrowthOS system status and statistics</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Merchants", value: String(s.totalMerchants) },
          { label: "Active Users", value: String(s.activeUsers) },
          { label: "Total Products", value: String(s.totalProducts) },
          { label: "Total Orders", value: String(s.totalOrders) },
          { label: "Total Customers", value: String(s.totalCustomers) },
          { label: "Platform Revenue", value: `₹${(s.totalRevenue / 100).toLocaleString("en-IN")}` },
        ].map((stat) => (
          <div key={stat.label} className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">{stat.label}</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{stat.value}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-growthos-text mb-4">Merchants</h2>
        {data!.merchants.length === 0 ? (
          <div className="text-growthos-muted text-sm">No merchants registered.</div>
        ) : (
          <div className="space-y-3">
            {data!.merchants.map((m: any) => (
              <div key={m.id} className="p-4 bg-growthos-surface border border-growthos-border rounded-lg">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-growthos-text">{m.businessName}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    m.status === "ACTIVE" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                  }`}>{m.status}</span>
                </div>
                <div className="text-sm text-growthos-muted mt-1">
                  Owner: {m.owner?.name} ({m.owner?.email}) · Products: {m._count?.products} · Orders: {m._count?.orders} · Customers: {m._count?.customers}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-growthos-text mb-4">Recent Audit Events</h2>
        {data!.recentAuditEvents.length === 0 ? (
          <div className="text-growthos-muted text-sm">No audit events.</div>
        ) : (
          <div className="space-y-2">
            {data!.recentAuditEvents.slice(0, 10).map((e: any) => (
              <div key={e.id} className="p-3 bg-growthos-surface border border-growthos-border rounded-lg flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  e.severity === "CRITICAL" || e.severity === "ERROR" ? "bg-red-400" : e.severity === "WARNING" ? "bg-yellow-400" : "bg-green-400"
                }`} />
                <span className="text-growthos-text">{e.action.replace(/_/g, " ")}</span>
                {/* `AuditLog` has no actorType; it records the outcome instead. */}
                <span className="text-growthos-muted">{e.outcome}</span>
                <span className="text-growthos-muted ml-auto">{new Date(e.createdAt).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
