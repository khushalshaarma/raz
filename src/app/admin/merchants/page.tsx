"use client";

import { useEffect, useState } from "react";

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((d) => setMerchants(d.merchants || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Merchants</h1>
        <p className="text-growthos-muted text-sm mt-1">Registered merchants on the platform</p>
      </div>

      {merchants.length === 0 ? (
        <div className="text-growthos-muted text-sm">No merchants registered.</div>
      ) : (
        <div className="space-y-3">
          {merchants.map((m: any) => (
            <div key={m.id} className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-growthos-text">{m.businessName}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  m.status === "ACTIVE" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                }`}>{m.status}</span>
              </div>
              <div className="text-sm text-growthos-muted mt-2">
                Owner: {m.owner?.name} · {m.owner?.email}
              </div>
              <div className="text-sm text-growthos-muted mt-1">
                Currency: {m.currency} · Timezone: {m.timezone}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
