"use client";

import { useEffect, useState } from "react";

interface GrowthCycle {
  id: string;
  status: string;
  currentStep: string;
  opportunityCount: number;
  strategyCount: number;
  decisionCount: number;
  executionCount: number;
  blockReason: string | null;
  failReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export default function GrowthCyclesPage() {
  const [cycles, setCycles] = useState<GrowthCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/merchant/growth-cycles")
      .then((r) => r.json())
      .then((data) => {
        setCycles(data.cycles ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const startCycle = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/merchant/growth-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (data.cycleId) {
        const listRes = await fetch("/api/merchant/growth-cycles");
        const listData = await listRes.json();
        setCycles(listData.cycles ?? []);
      }
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  const statusColors: Record<string, string> = {
    CREATED: "bg-gray-100 text-gray-700",
    COMPLETED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    BLOCKED: "bg-orange-100 text-orange-700",
    WAITING_APPROVAL: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Growth Cycles</h1>
        <button
          onClick={startCycle}
          disabled={running}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Running..." : "Start New Cycle"}
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Step</th>
              <th className="text-left p-3">Opps</th>
              <th className="text-left p-3">Strats</th>
              <th className="text-left p-3">Decisions</th>
              <th className="text-left p-3">Execs</th>
              <th className="text-left p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {cycles.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-gray-400">No growth cycles yet</td></tr>
            ) : (
              cycles.map((cycle) => (
                <tr key={cycle.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${statusColors[cycle.status] ?? "bg-gray-100"}`}>
                      {cycle.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">{cycle.currentStep}</td>
                  <td className="p-3">{cycle.opportunityCount}</td>
                  <td className="p-3">{cycle.strategyCount}</td>
                  <td className="p-3">{cycle.decisionCount}</td>
                  <td className="p-3">{cycle.executionCount}</td>
                  <td className="p-3 text-gray-500">{new Date(cycle.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
