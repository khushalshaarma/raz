"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatConfidencePercent } from "@/lib/product/format";

type StrategyItem = {
  id: string;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  scenarioType: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  explanation: string;
  formattedDecisionScore: string;
  riskColor: string;
  scenarioLabel: string;
  daysOld: number;
  createdAt: string;
};

type StrategyStats = {
  total: number;
  recentCount: number;
  avgDecisionScore: number;
  byRisk: { level: string; count: number; avgScore: number; color: string }[];
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

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyItem[]>([]);
  const [stats, setStats] = useState<StrategyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareResult, setCompareResult] = useState<{
    avgDecisionScore: number;
    topStrategy: StrategyItem | null;
    byRisk: { level: string; count: number }[];
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/merchant/strategies");
      const data = await res.json();
      setStrategies(data.strategies || []);
      setStats(data.stats || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleCompare(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function runCompare() {
    if (selectedIds.length < 2) return;
    const res = await fetch("/api/merchant/strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyIds: selectedIds }),
    });
    const data = await res.json();
    setCompareResult(data.comparison);
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
            Strategy Workspace
          </h1>
          <p className="text-growthos-muted text-sm mt-1">
            Compare strategies, review ROI projections, and analyze scenarios
          </p>
        </div>
        <div className="flex gap-2">
          {compareMode ? (
            <>
              <button
                disabled={selectedIds.length < 2}
                onClick={runCompare}
                className="px-4 py-2 text-sm font-medium bg-growthos-accent/10 text-growthos-accent rounded-lg hover:bg-growthos-accent/20 transition-colors disabled:opacity-50"
              >
                Compare ({selectedIds.length})
              </button>
              <button
                onClick={() => {
                  setCompareMode(false);
                  setSelectedIds([]);
                  setCompareResult(null);
                }}
                className="px-4 py-2 text-sm font-medium text-growthos-muted hover:text-growthos-text transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setCompareMode(true)}
              className="px-4 py-2 text-sm font-medium bg-growthos-surface border border-growthos-border rounded-lg hover:border-growthos-accent/30 transition-colors text-growthos-text"
            >
              Compare Strategies
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Total Strategies</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">
              {stats.total}
            </div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Last 30 Days</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">
              {stats.recentCount}
            </div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Avg Decision Score</div>
            <div
              className={`text-2xl font-bold mt-1 ${getScoreColor(stats.avgDecisionScore)}`}
            >
              {stats.avgDecisionScore}/100
            </div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">By Risk Level</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {stats.byRisk.map((r) => (
                <span
                  key={r.level}
                  className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLORS[r.color] || "bg-gray-500/10 text-gray-400"}`}
                >
                  {r.level}: {r.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compare Result */}
      {compareResult && (
        <div className="p-5 bg-growthos-surface border border-growthos-accent/30 rounded-xl space-y-3">
          <h3 className="font-medium text-growthos-text">Comparison Result</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-growthos-muted">Avg Score: </span>
              <span className="text-growthos-text font-medium">
                {compareResult.avgDecisionScore}/100
              </span>
            </div>
            <div>
              <span className="text-growthos-muted">Top: </span>
              <span className="text-growthos-text font-medium">
                {compareResult.topStrategy?.strategyName || "N/A"}
              </span>
            </div>
            <div className="flex gap-2">
              {compareResult.byRisk.map((r) => (
                <span
                  key={r.level}
                  className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLORS[r.level === "LOW" ? "green" : r.level === "MEDIUM" ? "yellow" : "red"] || "bg-gray-500/10 text-gray-400"}`}
                >
                  {r.level}: {r.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Strategy List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-growthos-muted">Loading strategies...</div>
        </div>
      ) : strategies.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📋</div>
          <div className="text-growthos-muted text-lg">
            No strategies simulated yet
          </div>
          <p className="text-growthos-muted text-sm mt-2">
            Strategies appear after running intelligence analysis on opportunities
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => (
            <div
              key={s.id}
              className={`p-4 bg-growthos-surface border rounded-xl transition-colors ${
                compareMode && selectedIds.includes(s.id)
                  ? "border-growthos-accent/50 bg-growthos-accent/5"
                  : "border-growthos-border hover:border-growthos-accent/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleCompare(s.id)}
                      className="w-4 h-4 accent-growthos-accent"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/merchant/strategies/${s.id}`}
                        className="font-medium text-growthos-text hover:text-growthos-accent transition-colors"
                      >
                        {s.strategyName}
                      </Link>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          s.riskColor === "green"
                            ? "bg-green-500/10 text-green-400"
                            : s.riskColor === "yellow"
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {s.riskLevel} Risk
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-growthos-accent/10 text-growthos-accent">
                        {TYPE_LABELS[s.opportunityType] || s.opportunityType}
                      </span>
                    </div>
                    <div className="flex gap-6 text-sm mt-2">
                      <span className="text-growthos-muted">
                        Score:{" "}
                        <span className={`font-medium ${getScoreColor(s.decisionScore)}`}>
                          {s.formattedDecisionScore}
                        </span>
                      </span>
                      <span className="text-growthos-muted">
                        Scenario:{" "}
                        <span className="text-growthos-text font-medium">
                          {s.scenarioLabel}
                        </span>
                      </span>
                      <span className="text-growthos-muted">
                        Confidence:{" "}
                        <span className="text-growthos-text font-medium">
                          {formatConfidencePercent(s.confidence)}
                        </span>
                      </span>
                      <span className="text-growthos-muted">
                        {s.daysOld}d ago
                      </span>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/merchant/strategies/${s.id}`}
                  className="text-xs text-growthos-muted hover:text-growthos-accent transition-colors ml-4"
                >
                  Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
