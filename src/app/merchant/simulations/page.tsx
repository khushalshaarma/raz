"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type SimulationItem = {
  id: string;
  opportunityType: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  explanation: string | null;
  formattedScore: string;
  riskColor: string;
  scenarioLabel: string;
  isSimulated: true;
  createdAt: string;
};

type SimulationStats = {
  total: number;
  recentCount: number;
  avgDecisionScore: number;
  avgConfidence: number;
  byRisk: { level: string; count: number; color: string }[];
  byScenario: { scenario: string; label: string; count: number }[];
};

const RISK_COLORS: Record<string, string> = {
  green: "bg-green-500/10 text-green-400",
  yellow: "bg-yellow-500/10 text-yellow-400",
  red: "bg-red-500/10 text-red-400",
  gray: "bg-gray-500/10 text-gray-400",
};

const TYPE_LABELS: Record<string, string> = {
  INACTIVE_CUSTOMERS: "Inactive Customers",
  CART_ABANDONMENT: "Cart Abandonment",
  UPSELL: "Upsell",
  CROSS_SELL: "Cross-Sell",
  LOW_CONVERSION: "Low Conversion",
  PAYMENT_RECOVERY: "Payment Recovery",
  HIGH_VALUE_CUSTOMER: "High Value Customer",
};

export default function SimulationsPage() {
  const [simulations, setSimulations] = useState<SimulationItem[]>([]);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runForm, setRunForm] = useState({
    opportunityType: "INACTIVE_CUSTOMERS",
    strategyId: "",
    strategyName: "",
  });
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    decisionScore: number;
    recommendedScenario: string;
    explanation: string;
    scenarios: { type: string; revenue: string; cost: string; netImpact: string; roi: number; riskLevel: string }[];
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/merchant/simulations");
      const data = await res.json();
      setSimulations(data.simulations || []);
      setStats(data.stats || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleRunSimulation() {
    if (!runForm.strategyId || !runForm.strategyName) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/merchant/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runForm),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRunResult(data.simulation);
      await fetchData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  }

  function getScoreColor(score: number): string {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-growthos-text">
            Simulation Center
          </h1>
          <p className="text-growthos-muted text-sm mt-1">
            What-if analysis for growth strategies · All values are{" "}
            <span className="text-yellow-400 font-medium">SIMULATED</span>
          </p>
        </div>
        <button
          onClick={() => {
            setShowRunModal(true);
            setRunResult(null);
          }}
          className="px-4 py-2 text-sm font-medium bg-growthos-accent/10 text-growthos-accent rounded-lg hover:bg-growthos-accent/20 transition-colors"
        >
          Run Simulation
        </button>
      </div>

      {/* Simulated Banner */}
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm font-medium">
        ⚠️ All simulation results are SIMULATED projections — not actual outcomes. Actual results may differ significantly.
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Total Simulations</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{stats.total}</div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Last 30 Days</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{stats.recentCount}</div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Avg Score</div>
            <div className={`text-2xl font-bold mt-1 ${getScoreColor(stats.avgDecisionScore)}`}>
              {stats.avgDecisionScore}/100
            </div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">By Risk</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {stats.byRisk.map((r) => (
                <span key={r.level} className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLORS[r.color]}`}>
                  {r.level}: {r.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Run Simulation Modal */}
      {showRunModal && (
        <div className="p-5 bg-growthos-surface border border-growthos-accent/30 rounded-xl space-y-4">
          <h3 className="font-medium text-growthos-text">Run New Simulation</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-growthos-muted mb-1">Opportunity Type</label>
              <select
                value={runForm.opportunityType}
                onChange={(e) => setRunForm({ ...runForm, opportunityType: e.target.value })}
                className="w-full p-2 bg-growthos-bg border border-growthos-border rounded-lg text-sm text-growthos-text"
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-growthos-muted mb-1">Strategy ID</label>
              <input
                value={runForm.strategyId}
                onChange={(e) => setRunForm({ ...runForm, strategyId: e.target.value })}
                placeholder="e.g. discount-15pct"
                className="w-full p-2 bg-growthos-bg border border-growthos-border rounded-lg text-sm text-growthos-text placeholder:text-growthos-muted"
              />
            </div>
            <div>
              <label className="block text-sm text-growthos-muted mb-1">Strategy Name</label>
              <input
                value={runForm.strategyName}
                onChange={(e) => setRunForm({ ...runForm, strategyName: e.target.value })}
                placeholder="e.g. 15% Discount Campaign"
                className="w-full p-2 bg-growthos-bg border border-growthos-border rounded-lg text-sm text-growthos-text placeholder:text-growthos-muted"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRunSimulation}
              disabled={running || !runForm.strategyId || !runForm.strategyName}
              className="px-4 py-2 text-sm font-medium bg-growthos-accent/10 text-growthos-accent rounded-lg hover:bg-growthos-accent/20 transition-colors disabled:opacity-50"
            >
              {running ? "Running..." : "Run Simulation"}
            </button>
            <button
              onClick={() => { setShowRunModal(false); setRunResult(null); }}
              className="px-4 py-2 text-sm font-medium text-growthos-muted hover:text-growthos-text transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Run Result */}
          {runResult && (
            <div className="mt-4 p-4 bg-growthos-bg border border-growthos-border rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-yellow-400">SIMULATED</span>
                <span className={`text-2xl font-bold ${getScoreColor(runResult.decisionScore)}`}>
                  {runResult.decisionScore}/100
                </span>
                <span className="text-sm text-growthos-muted">
                  → {runResult.recommendedScenario} scenario
                </span>
              </div>
              <p className="text-sm text-growthos-muted">{runResult.explanation}</p>
              <div className="grid grid-cols-3 gap-3">
                {runResult.scenarios.map((sc) => (
                  <div key={sc.type} className="p-3 bg-growthos-surface border border-growthos-border rounded-lg text-sm">
                    <div className="font-medium text-growthos-text">{sc.type}</div>
                    <div className="text-growthos-muted mt-1">Revenue: {sc.revenue}</div>
                    <div className="text-growthos-muted">Cost: {sc.cost}</div>
                    <div className="text-growthos-text font-medium">Net: {sc.netImpact}</div>
                    <div className="text-growthos-muted">ROI: {sc.roi}x</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simulation List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-growthos-muted">Loading simulations...</div>
        </div>
      ) : simulations.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🧪</div>
          <div className="text-growthos-muted text-lg">No simulations yet</div>
          <p className="text-growthos-muted text-sm mt-2">
            Run a simulation to see projected outcomes for your strategies
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {simulations.map((s) => (
            <Link
              key={s.id}
              href={`/merchant/simulations/${s.id}`}
              className="block p-4 bg-growthos-surface border border-growthos-border rounded-xl hover:border-growthos-accent/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-yellow-400 font-medium">SIMULATED</span>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-growthos-text">{s.strategyName}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        s.riskColor === "green" ? "bg-green-500/10 text-green-400" :
                        s.riskColor === "yellow" ? "bg-yellow-500/10 text-yellow-400" :
                        "bg-red-500/10 text-red-400"
                      }`}>
                        {s.riskLevel} Risk
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-growthos-accent/10 text-growthos-accent">
                        {TYPE_LABELS[s.opportunityType] || s.opportunityType}
                      </span>
                    </div>
                    <div className="flex gap-6 text-sm mt-1">
                      <span className="text-growthos-muted">
                        Score: <span className={`font-medium ${getScoreColor(s.decisionScore)}`}>{s.formattedScore}</span>
                      </span>
                      <span className="text-growthos-muted">
                        Scenario: <span className="text-growthos-text font-medium">{s.scenarioLabel}</span>
                      </span>
                      <span className="text-growthos-muted">
                        Confidence: <span className="text-growthos-text font-medium">{Math.round(s.confidence)}%</span>
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-growthos-muted">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
