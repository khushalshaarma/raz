"use client";

import { useEffect, useState } from "react";

export default function MerchantCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Campaigns</h1>
        <p className="text-growthos-muted text-sm mt-1">Manage your marketing campaigns</p>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-growthos-muted text-sm">No campaigns yet.</div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c: any) => (
            <div key={c.id} className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-semibold text-growthos-text">{c.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  c.status === "RUNNING" ? "bg-green-500/10 text-green-400" :
                  c.status === "COMPLETED" ? "bg-gray-500/10 text-gray-400" :
                  c.status === "DRAFT" ? "bg-yellow-500/10 text-yellow-400" :
                  "bg-blue-500/10 text-blue-400"
                }`}>
                  {c.status}
                </span>
              </div>
              <div className="flex gap-6 text-sm text-growthos-muted">
                {c.targetAudience && <span>Target: {c.targetAudience.replace(/_/g, " ")}</span>}
                {c.budgetMinor && <span>Budget: ₹{(c.budgetMinor / 100).toLocaleString("en-IN")}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
