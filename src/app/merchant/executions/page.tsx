"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Execution {
  id: string;
  actionType: string;
  strategyId: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string;
  providerReference: string | null;
  failureCode: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  executionAttempts: Array<{ status: string; attemptNumber: number }>;
  reconciliation?: { status: string } | null;
}

type FilterType = "ALL" | "CREATED" | "EXECUTING" | "SUCCEEDED" | "FAILED";

const STATUS_TABS: { key: FilterType; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "CREATED", label: "Created" },
  { key: "EXECUTING", label: "In Progress" },
  { key: "SUCCEEDED", label: "Succeeded" },
  { key: "FAILED", label: "Failed" },
];

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterType>("ALL");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = filter !== "ALL" ? `?status=${filter}&take=50` : "?take=50";
        const res = await fetch(`/api/merchant/executions${params}`);
        const data = await res.json();
        setExecutions(data.executions || []);
      } catch {
        setError("Failed to load executions");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [filter]);

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      SUCCEEDED: "bg-green-500/10 text-green-400",
      FAILED: "bg-red-500/10 text-red-400",
      CREATED: "bg-gray-500/10 text-gray-400",
      PREFLIGHT: "bg-blue-500/10 text-blue-400",
      SUBMITTED: "bg-yellow-500/10 text-yellow-400",
      EXECUTING: "bg-yellow-500/10 text-yellow-400",
      RETRYING: "bg-orange-500/10 text-orange-400",
    };
    return map[status] || "bg-gray-500/10 text-gray-400";
  };

  const stats = {
    total: executions.length,
    succeeded: executions.filter((e) => e.status === "SUCCEEDED").length,
    failed: executions.filter((e) => e.status === "FAILED").length,
    inProgress: executions.filter((e) => ["CREATED", "PREFLIGHT", "SUBMITTED", "EXECUTING"].includes(e.status)).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Execution Center</h1>
        <p className="text-growthos-muted text-sm mt-1">
          Real execution history with status tracking and retry details
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Total</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{stats.total}</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Succeeded</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{stats.succeeded}</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Failed</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{stats.failed}</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">In Progress</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{stats.inProgress}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-growthos-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === tab.key
                ? "text-growthos-accent border-b-2 border-growthos-accent"
                : "text-growthos-muted hover:text-growthos-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Execution List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-growthos-muted">Loading executions...</div>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
      ) : executions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">⚡</div>
          <div className="text-growthos-muted text-lg">No executions found</div>
          <p className="text-growthos-muted text-sm mt-2">
            Executions appear after governance approves an action
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {executions.map((e) => (
            <Link
              key={e.id}
              href={`/merchant/executions/${e.id}`}
              className="block p-4 bg-growthos-surface border border-growthos-border rounded-xl hover:border-growthos-accent/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-growthos-text">{e.actionType}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                      <span className="text-sm text-growthos-muted">{e.provider}</span>
                    </div>
                    <div className="flex gap-6 text-sm mt-2">
                      <span className="text-growthos-muted">
                        Amount:{" "}
                        <span className="text-growthos-text font-medium">
                          ₹{((e.amountMinor) / 100).toLocaleString("en-IN")}
                        </span>
                      </span>
                      <span className="text-growthos-muted">
                        Attempts:{" "}
                        <span className="text-growthos-text font-medium">
                          {e.executionAttempts?.length || 0}
                        </span>
                      </span>
                      {e.failureCode && (
                        <span className="text-red-400 text-xs">
                          {e.failureCode}
                        </span>
                      )}
                      <span className="text-growthos-muted">
                        {new Date(e.createdAt).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-growthos-muted ml-4">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
