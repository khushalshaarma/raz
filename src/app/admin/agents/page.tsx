"use client";

import { useEffect, useState } from "react";

interface AgentRun {
  id: string;
  merchantId: string;
  agentType: string;
  status: string;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface AgentEvent {
  id: string;
  merchantId: string;
  eventType: string;
  agentType: string | null;
  title: string;
  severity: string;
  timestamp: string;
}

interface AdminData {
  failedRuns: AgentRun[];
  blockedRuns: AgentRun[];
  runningRuns: AgentRun[];
  longRunning: AgentRun[];
  securityEvents: AgentEvent[];
  stats: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    successRate: number;
  };
}

export default function AdminAgentsPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/agents")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!data) return <div className="p-8">Failed to load</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Agent Monitor</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Total Runs</div>
          <div className="text-2xl font-bold">{data.stats.totalRuns}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Completed</div>
          <div className="text-2xl font-bold text-green-600">{data.stats.completedRuns}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Failed</div>
          <div className="text-2xl font-bold text-red-600">{data.stats.failedRuns}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Success Rate</div>
          <div className="text-2xl font-bold">{Math.round(data.stats.successRate * 100)}%</div>
        </div>
      </div>

      {data.longRunning.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 text-orange-600">Long Running ({data.longRunning.length})</h2>
          <div className="bg-white rounded-lg border overflow-hidden">
            {data.longRunning.map((run) => (
              <div key={run.id} className="p-3 border-b text-sm flex justify-between">
                <span>{run.agentType} - {run.merchantId.slice(0, 8)}...</span>
                <span className="text-orange-600">Running for {run.durationMs ? Math.round(run.durationMs / 1000) : "?"}s</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.failedRuns.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 text-red-600">Failed Runs ({data.failedRuns.length})</h2>
          <div className="bg-white rounded-lg border overflow-hidden">
            {data.failedRuns.slice(0, 10).map((run) => (
              <div key={run.id} className="p-3 border-b text-sm flex justify-between">
                <span>{run.agentType} - {run.merchantId.slice(0, 8)}...</span>
                <span className="text-red-600 text-xs">{run.error?.slice(0, 50)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.securityEvents.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Security Events ({data.securityEvents.length})</h2>
          <div className="bg-white rounded-lg border overflow-hidden">
            {data.securityEvents.slice(0, 10).map((event) => (
              <div key={event.id} className="p-3 border-b text-sm flex justify-between">
                <span>{event.eventType} - {event.title}</span>
                <span className={`text-xs ${event.severity === "ERROR" ? "text-red-600" : "text-yellow-600"}`}>
                  {event.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
