"use client";

import { useEffect, useState } from "react";

interface AgentRun {
  id: string;
  agentType: string;
  status: string;
  confidence: number | null;
  durationMs: number | null;
  createdAt: string;
}

interface AgentStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
  averageDurationMs: number;
}

export default function AgentsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/agents")
      .then((r) => r.json())
      .then((data) => {
        setRuns(data.recentRuns ?? []);
        setStats(data.stats ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8">Loading agents...</div>;

  const agentTypes = ["OPPORTUNITY", "STRATEGY", "SIMULATION", "DECISION", "SECURITY", "GOVERNANCE", "EXECUTION", "OBSERVATION", "LEARNING"];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Agent Dashboard</h1>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-500">Total Runs</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-500">Completed</div>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-500">Failed</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-500">Success Rate</div>
            <div className="text-2xl font-bold">{Math.round(stats.successRate * 100)}%</div>
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-4">Agent Types</h2>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {agentTypes.map((type) => {
          const typeRuns = runs.filter((r) => r.agentType === type);
          const completed = typeRuns.filter((r) => r.status === "COMPLETED").length;
          const failed = typeRuns.filter((r) => r.status === "FAILED").length;
          return (
            <div key={type} className="bg-white rounded-lg border p-3">
              <div className="font-medium text-sm">{type}</div>
              <div className="text-xs text-gray-500">
                {completed} completed, {failed} failed
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent Agent Runs</h2>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Agent</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Confidence</th>
              <th className="text-left p-3">Duration</th>
              <th className="text-left p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-gray-400">No agent runs yet</td></tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="p-3 font-medium">{run.agentType}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      run.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                      run.status === "FAILED" ? "bg-red-100 text-red-700" :
                      run.status === "RUNNING" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="p-3">{run.confidence != null ? `${run.confidence}%` : "-"}</td>
                  <td className="p-3">{run.durationMs != null ? `${run.durationMs}ms` : "-"}</td>
                  <td className="p-3 text-gray-500">{new Date(run.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
