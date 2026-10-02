"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type DecisionItem = {
  id: string;
  opportunityType: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  decisionCategory: string;
  explanation: string;
  formattedScore: string;
  riskColor: string;
  categoryLabel: string;
  categoryColor: string;
  scenarioLabel: string;
  createdAt: string;
};

type DecisionStats = {
  total: number;
  recentCount: number;
  avgDecisionScore: number;
  avgConfidence: number;
  byCategory: { category: string; label: string; color: string; count: number }[];
  byRisk: { level: string; count: number; color: string }[];
};

const CATEGORY_BADGES: Record<string, string> = {
  green: "bg-green-500/10 text-green-400",
  blue: "bg-blue-500/10 text-blue-400",
  yellow: "bg-yellow-500/10 text-yellow-400",
  gray: "bg-gray-500/10 text-gray-400",
  red: "bg-red-500/10 text-red-400",
};

const RISK_BADGES: Record<string, string> = {
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

const CATEGORY_TABS = [
  { key: "ALL", label: "All" },
  { key: "STRONG_RECOMMENDATION", label: "Strong" },
  { key: "RECOMMEND", label: "Recommend" },
  { key: "LOW_CONFIDENCE_RECOMMENDATION", label: "Low Confidence" },
  { key: "NO_CLEAR_WINNER", label: "Unclear" },
  { key: "DO_NOT_ACT", label: "Do Not Act" },
];

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [stats, setStats] = useState<DecisionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const categoryParam = activeTab !== "ALL" ? `&category=${activeTab}` : "";
      const [decRes, statsRes] = await Promise.all([
        fetch(`/api/merchant/decisions?${categoryParam}`),
        fetch("/api/merchant/decisions"),
      ]);
      const decData = await decRes.json();
      const statsData = await statsRes.json();
      setDecisions(decData.decisions || []);
      setStats(statsData.stats || null);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function getScoreColor(score: number): string {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Decision Center</h1>
        <p className="text-growthos-muted text-sm mt-1">
          Strategy recommendations with evidence, scores, and reasoning
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Total Decisions</div>
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
            <div className="text-sm text-growthos-muted">By Category</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {stats.byCategory.map((c) => (
                <span key={c.category} className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_BADGES[c.color]}`}>
                  {c.label}: {c.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 border-b border-growthos-border overflow-x-auto">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "text-growthos-accent border-b-2 border-growthos-accent"
                : "text-growthos-muted hover:text-growthos-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Decisions List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-growthos-muted">Loading decisions...</div>
        </div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🧠</div>
          <div className="text-growthos-muted text-lg">No decisions yet</div>
          <p className="text-growthos-muted text-sm mt-2">
            Decisions appear after running simulations on your strategies
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => (
            <Link
              key={d.id}
              href={`/merchant/decisions/${d.id}`}
              className="block p-4 bg-growthos-surface border border-growthos-border rounded-xl hover:border-growthos-accent/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-growthos-text">{d.strategyName}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_BADGES[d.categoryColor]}`}>
                        {d.categoryLabel}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_BADGES[d.riskColor]}`}>
                        {d.riskLevel} Risk
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-growthos-accent/10 text-growthos-accent">
                        {TYPE_LABELS[d.opportunityType] || d.opportunityType}
                      </span>
                    </div>
                    <p className="text-sm text-growthos-muted mt-1 line-clamp-2">{d.explanation}</p>
                    <div className="flex gap-6 text-sm mt-2">
                      <span className="text-growthos-muted">
                        Score: <span className={`font-medium ${getScoreColor(d.decisionScore)}`}>{d.formattedScore}</span>
                      </span>
                      <span className="text-growthos-muted">
                        Confidence: <span className="text-growthos-text font-medium">{Math.round(d.confidence)}%</span>
                      </span>
                      <span className="text-growthos-muted">
                        Scenario: <span className="text-growthos-text font-medium">{d.scenarioLabel}</span>
                      </span>
                      <span className="text-growthos-muted">
                        {new Date(d.createdAt).toLocaleDateString("en-IN")}
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
