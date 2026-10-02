"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatConfidencePercent } from "@/lib/product/format";

type StrategyDetail = {
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
  baselineSnapshot: Record<string, unknown> | null;
  configSnapshot: Record<string, unknown> | null;
  decisions: {
    id: string;
    decisionCategory: string;
    decisionScore: number;
    explanation: string;
    confidence: number;
    riskLevel: string;
    createdAt: string;
  }[];
  experiments: {
    id: string;
    predictedNetImpactMinor: number;
    actualNetImpactMinor: number | null;
    predictionError: number | null;
    isCalibrated: boolean;
    calibrationCount: number;
  }[];
  relatedActions: {
    id: string;
    status: string;
    amountMinor: number;
    createdAt: string;
  }[];
  createdAt: string;
};

const RISK_BADGES: Record<string, string> = {
  LOW: "bg-green-500/10 text-green-400 border-green-500/20",
  MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  HIGH: "bg-red-500/10 text-red-400 border-red-500/20",
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/20",
};

const CATEGORY_LABELS: Record<string, string> = {
  STRONG_RECOMMENDATION: "Strong Recommendation",
  RECOMMEND: "Recommend",
  LOW_CONFIDENCE_RECOMMENDATION: "Low Confidence",
  NO_CLEAR_WINNER: "No Clear Winner",
  DO_NOT_ACT: "Do Not Act",
};

const CATEGORY_COLORS: Record<string, string> = {
  STRONG_RECOMMENDATION: "bg-green-500/10 text-green-400",
  RECOMMEND: "bg-blue-500/10 text-blue-400",
  LOW_CONFIDENCE_RECOMMENDATION: "bg-yellow-500/10 text-yellow-400",
  NO_CLEAR_WINNER: "bg-gray-500/10 text-gray-400",
  DO_NOT_ACT: "bg-red-500/10 text-red-400",
};

export default function StrategyDetailPage() {
  const { id } = useParams();
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStrategy = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/merchant/strategies/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStrategy(data.strategy);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStrategy();
  }, [fetchStrategy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-growthos-muted">Loading strategy...</div>
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link
          href="/merchant/strategies"
          className="text-sm text-growthos-muted hover:text-growthos-accent"
        >
          ← Back to strategies
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error || "Strategy not found"}
        </div>
      </div>
    );
  }

  const scoreColor =
    strategy.decisionScore >= 80
      ? "text-green-400"
      : strategy.decisionScore >= 60
        ? "text-yellow-400"
        : strategy.decisionScore >= 40
          ? "text-orange-400"
          : "text-red-400";

  const baseline = strategy.baselineSnapshot as Record<string, number> | null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href="/merchant/strategies"
        className="text-sm text-growthos-muted hover:text-growthos-accent"
      >
        ← Back to strategies
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-growthos-text">
            {strategy.strategyName}
          </h1>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium border ${RISK_BADGES[strategy.riskLevel] || RISK_BADGES.MEDIUM}`}
          >
            {strategy.riskLevel} Risk
          </span>
        </div>
        <p className="text-sm text-growthos-muted mt-1">
          Created {strategy.daysOld}d ago · {strategy.scenarioLabel} scenario
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Decision Score</div>
          <div className={`text-3xl font-bold mt-1 ${scoreColor}`}>
            {strategy.decisionScore}
            <span className="text-lg">/100</span>
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Confidence</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">
            {formatConfidencePercent(strategy.confidence)}
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Risk Level</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">
            {strategy.riskLevel}
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Recommended</div>
          <div className="text-2xl font-bold text-growthos-accent mt-1">
            {strategy.scenarioLabel}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
        <h3 className="font-medium text-growthos-text mb-2">Analysis</h3>
        <p className="text-sm text-growthos-muted leading-relaxed">
          {strategy.explanation}
        </p>
      </div>

      {/* Baseline */}
      {baseline && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">
            Baseline Data
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {baseline.conversionRate !== undefined && (
              <div>
                <div className="text-growthos-muted">Conversion Rate</div>
                <div className="text-growthos-text font-medium">
                  {((baseline.conversionRate as number) * 100).toFixed(1)}%
                </div>
              </div>
            )}
            {baseline.averageOrderValue !== undefined && (
              <div>
                <div className="text-growthos-muted">Avg Order Value</div>
                <div className="text-growthos-text font-medium">
                  ₹{((baseline.averageOrderValue as number) / 100).toLocaleString("en-IN")}
                </div>
              </div>
            )}
            {baseline.totalCustomers !== undefined && (
              <div>
                <div className="text-growthos-muted">Total Customers</div>
                <div className="text-growthos-text font-medium">
                  {baseline.totalCustomers as number}
                </div>
              </div>
            )}
            {baseline.dataQuality !== undefined && (
              <div>
                <div className="text-growthos-muted">Data Quality</div>
                <div className="text-growthos-text font-medium">
                  {baseline.dataQuality as number}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decisions */}
      {strategy.decisions.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">
            Decision History
          </h3>
          <div className="space-y-3">
            {strategy.decisions.map((d) => (
              <div
                key={d.id}
                className="p-3 bg-growthos-bg border border-growthos-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[d.decisionCategory] || "bg-gray-500/10 text-gray-400"}`}
                  >
                    {CATEGORY_LABELS[d.decisionCategory] || d.decisionCategory}
                  </span>
                  <span className="text-sm text-growthos-text font-medium">
                    Score: {d.decisionScore}/100
                  </span>
                  <span className="text-xs text-growthos-muted">
                    {new Date(d.createdAt).toLocaleDateString("en-IN")}
                  </span>
                </div>
                {d.explanation && (
                  <p className="text-sm text-growthos-muted mt-2">
                    {d.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Experiments */}
      {strategy.experiments.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">
            Calibration Experiments
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-growthos-border">
                  <th className="text-left py-2 text-growthos-muted font-medium">
                    Predicted
                  </th>
                  <th className="text-left py-2 text-growthos-muted font-medium">
                    Actual
                  </th>
                  <th className="text-left py-2 text-growthos-muted font-medium">
                    Error
                  </th>
                  <th className="text-left py-2 text-growthos-muted font-medium">
                    Calibrated
                  </th>
                </tr>
              </thead>
              <tbody>
                {strategy.experiments.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-growthos-border/50"
                  >
                    <td className="py-2 text-growthos-text">
                      ₹{((e.predictedNetImpactMinor) / 100).toLocaleString("en-IN")}
                    </td>
                    <td className="py-2 text-growthos-text">
                      {e.actualNetImpactMinor !== null
                        ? `₹${((e.actualNetImpactMinor) / 100).toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="py-2 text-growthos-text">
                      {e.predictionError !== null
                        ? `${e.predictionError.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          e.isCalibrated
                            ? "bg-green-500/10 text-green-400"
                            : "bg-gray-500/10 text-gray-400"
                        }`}
                      >
                        {e.isCalibrated ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Related Actions */}
      {strategy.relatedActions.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">
            Related Actions
          </h3>
          <div className="space-y-2">
            {strategy.relatedActions.map((a) => (
              <Link
                key={a.id}
                href={`/merchant/governance/actions/${a.id}`}
                className="flex items-center justify-between p-3 bg-growthos-bg border border-growthos-border rounded-lg hover:border-growthos-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      a.status === "APPROVED"
                        ? "bg-green-500/10 text-green-400"
                        : a.status === "PENDING"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : a.status === "BLOCKED"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-gray-500/10 text-gray-400"
                    }`}
                  >
                    {a.status}
                  </span>
                  <span className="text-sm text-growthos-text">
                    ₹{((a.amountMinor) / 100).toLocaleString("en-IN")}
                  </span>
                </div>
                <span className="text-xs text-growthos-muted">
                  {new Date(a.createdAt).toLocaleDateString("en-IN")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
