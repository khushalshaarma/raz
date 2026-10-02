"use client";

import { useEffect, useState } from "react";

interface Execution {
  id: string;
  merchantId: string;
  actionType: string;
  amountMinor: number;
  status: string;
  provider: string;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  merchant?: { businessName: string };
  executionAttempts: Array<{ status: string }>;
  reconciliation?: { status: string } | null;
}

export default function AdminExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/admin/executions?take=50");
        const data = await res.json();
        setExecutions(data.executions || []);
      } catch (e) {
        setError("Failed to load executions");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading executions...</div></div>;
  if (error) return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>;

  const statusColor = (status: string) => {
    switch (status) {
      case "SUCCEEDED": return "bg-green-500/10 text-green-400";
      case "FAILED": return "bg-red-500/10 text-red-400";
      case "PENDING": case "SUBMITTED": case "EXECUTING": return "bg-yellow-500/10 text-yellow-400";
      case "UNKNOWN": return "bg-orange-500/10 text-orange-400";
      default: return "bg-gray-500/10 text-gray-400";
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Admin Executions</h1>
        <p className="text-growthos-muted text-sm mt-1">All execution events across merchants</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-growthos-border text-growthos-muted">
              <th className="text-left py-3 px-4">ID</th>
              <th className="text-left py-3 px-4">Merchant</th>
              <th className="text-left py-3 px-4">Action</th>
              <th className="text-left py-3 px-4">Amount</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Provider</th>
              <th className="text-left py-3 px-4">Reconciliation</th>
              <th className="text-left py-3 px-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((e) => (
              <tr key={e.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                <td className="py-3 px-4 text-growthos-text font-mono text-xs">{e.id.slice(0, 8)}...</td>
                <td className="py-3 px-4 text-growthos-text">{e.merchant?.businessName || e.merchantId.slice(0, 8)}</td>
                <td className="py-3 px-4 text-growthos-text">{e.actionType}</td>
                <td className="py-3 px-4 text-growthos-text">{e.amountMinor} paise</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(e.status)}`}>{e.status}</span>
                </td>
                <td className="py-3 px-4 text-growthos-muted">{e.provider}</td>
                <td className="py-3 px-4">
                  {e.reconciliation ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      e.reconciliation.status === "MATCHED" ? "bg-green-500/10 text-green-400" :
                      e.reconciliation.status === "MISMATCH" ? "bg-red-500/10 text-red-400" :
                      "bg-yellow-500/10 text-yellow-400"
                    }`}>{e.reconciliation.status}</span>
                  ) : <span className="text-growthos-muted text-xs">-</span>}
                </td>
                <td className="py-3 px-4 text-growthos-muted">{new Date(e.createdAt).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {executions.length === 0 && <div className="text-growthos-muted text-sm py-8 text-center">No executions found.</div>}
      </div>
    </div>
  );
}
