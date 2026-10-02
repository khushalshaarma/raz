"use client";

import { useEffect, useState } from "react";

interface ReconciliationAlert {
  id: string;
  executionId: string;
  merchantId: string;
  provider: string;
  providerReference: string | null;
  providerStatus: string | null;
  growthOSStatus: string | null;
  amountMinor: number | null;
  currency: string | null;
  amountMatch: boolean | null;
  statusMatch: boolean | null;
  status: string;
  mismatchReason: string | null;
  createdAt: string;
  execution: { actionType: string; amountMinor: number };
}

export default function AdminReconciliationPage() {
  const [alerts, setAlerts] = useState<ReconciliationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/admin/reconciliation?status=MISMATCH&take=50");
        const data = await res.json();
        setAlerts(data.reconciliations || []);
      } catch (e) {
        setError("Failed to load reconciliation alerts");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading reconciliation alerts...</div></div>;
  if (error) return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>;

  const resolve = async (id: string, newStatus: string) => {
    try {
      await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconciliationId: id, status: newStatus }),
      });
      setAlerts(alerts.filter((a) => a.id !== id));
    } catch (e) {
      setError("Failed to resolve");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Reconciliation Alerts</h1>
        <p className="text-growthos-muted text-sm mt-1">Mismatched or unknown reconciliation states</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-growthos-border text-growthos-muted">
              <th className="text-left py-3 px-4">Execution</th>
              <th className="text-left py-3 px-4">Action</th>
              <th className="text-left py-3 px-4">Amount</th>
              <th className="text-left py-3 px-4">Provider Status</th>
              <th className="text-left py-3 px-4">GrowthOS Status</th>
              <th className="text-left py-3 px-4">Reason</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                <td className="py-3 px-4 text-growthos-text font-mono text-xs">{a.executionId.slice(0, 8)}...</td>
                <td className="py-3 px-4 text-growthos-text">{a.execution?.actionType}</td>
                <td className="py-3 px-4 text-growthos-text">{a.amountMinor || "-"} paise</td>
                <td className="py-3 px-4 text-growthos-muted">{a.providerStatus || "-"}</td>
                <td className="py-3 px-4 text-growthos-muted">{a.growthOSStatus || "-"}</td>
                <td className="py-3 px-4 text-growthos-muted text-xs">{a.mismatchReason || "-"}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => resolve(a.id, "MATCHED")} className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs hover:bg-green-500/20">Resolve</button>
                    <button onClick={() => resolve(a.id, "ALERT")} className="px-2 py-1 bg-red-500/10 text-red-400 rounded text-xs hover:bg-red-500/20">Escalate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {alerts.length === 0 && <div className="text-growthos-muted text-sm py-8 text-center">No reconciliation alerts.</div>}
      </div>
    </div>
  );
}
