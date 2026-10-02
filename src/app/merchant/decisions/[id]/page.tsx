"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type DecisionDetail = {
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
  evidence: string | null;
  simulation: {
    id: string;
    strategyName: string;
    recommendedScenario: string;
    decisionScore: number;
    riskLevel: string;
    confidence: number;
    explanation: string | null;
  } | null;
  outcomes: {
    id: string;
    predictedScenario: string;
    predictedNetImpactMinor: number;
    actualNetImpactMinor: number | null;
    absoluteError: number | null;
    percentageError: number | null;
    correctPrediction: boolean;
    createdAt: string;
  }[];
  relatedActions: {
    id: string;
    status: string;
    amountMinor: number;
    createdAt: string;
  }[];
  createdAt: string;
};

const CATEGORY_BADGES: Record<string, string> = {
  green: "bg-green-500/10 text-green-400 border-green-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  gray: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  red: "bg-red-500/10 text-red-400 border-red-500/20",
};

const SCENARIO_LABELS: Record<string, string> = {
  CONSERVATIVE: "Conservative",
  EXPECTED: "Expected",
  OPTIMISTIC: "Optimistic",
};

export default function DecisionDetailPage() {
  const { id } = useParams();
  const [decision, setDecision] = useState<DecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/merchant/decisions/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDecision(data.decision);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-growthos-muted">Loading decision...</div>
      </div>
    );
  }

  if (error || !decision) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/merchant/decisions" className="text-sm text-growthos-muted hover:text-growthos-accent">
          ← Back to decisions
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error || "Decision not found"}
        </div>
      </div>
    );
  }

  const scoreColor =
    decision.decisionScore >= 80 ? "text-green-400" :
    decision.decisionScore >= 60 ? "text-yellow-400" :
    decision.decisionScore >= 40 ? "text-orange-400" : "text-red-400";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/merchant/decisions" className="text-sm text-growthos-muted hover:text-growthos-accent">
        ← Back to decisions
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-growthos-text">{decision.strategyName}</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${CATEGORY_BADGES[decision.categoryColor] || CATEGORY_BADGES.gray}`}>
            {decision.categoryLabel}
          </span>
        </div>
        <p className="text-sm text-growthos-muted mt-1">
          Created {new Date(decision.createdAt).toLocaleDateString("en-IN")} · {decision.scenarioLabel} scenario
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Decision Score</div>
          <div className={`text-3xl font-bold mt-1 ${scoreColor}`}>
            {decision.decisionScore}<span className="text-lg">/100</span>
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Confidence</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{Math.round(decision.confidence)}%</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Risk Level</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{decision.riskLevel}</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Outcomes</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{decision.outcomes.length}</div>
        </div>
      </div>

      {/* Explanation */}
      <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
        <h3 className="font-medium text-growthos-text mb-2">Decision Reasoning</h3>
        <p className="text-sm text-growthos-muted leading-relaxed">{decision.explanation}</p>
      </div>

      {/* Evidence */}
      {decision.evidence && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-2">Evidence</h3>
          <p className="text-sm text-growthos-muted">{decision.evidence}</p>
        </div>
      )}

      {/* Linked Simulation */}
      {decision.simulation && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Linked Simulation</h3>
          <Link
            href={`/merchant/simulations/${decision.simulation.id}`}
            className="block p-3 bg-growthos-bg border border-growthos-border rounded-lg hover:border-growthos-accent/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-growthos-text">{decision.simulation.strategyName}</span>
              <span className="text-sm text-growthos-muted">Score: {decision.simulation.decisionScore}/100</span>
              <span className="text-sm text-growthos-muted">Risk: {decision.simulation.riskLevel}</span>
            </div>
          </Link>
        </div>
      )}

      {/* Prediction Outcomes */}
      {decision.outcomes.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Prediction Tracking</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-growthos-border">
                  <th className="text-left py-2 text-growthos-muted font-medium">Predicted</th>
                  <th className="text-left py-2 text-growthos-muted font-medium">Net Impact</th>
                  <th className="text-left py-2 text-growthos-muted font-medium">Actual</th>
                  <th className="text-left py-2 text-growthos-muted font-medium">Error</th>
                  <th className="text-left py-2 text-growthos-muted font-medium">Correct</th>
                </tr>
              </thead>
              <tbody>
                {decision.outcomes.map((o) => (
                  <tr key={o.id} className="border-b border-growthos-border/50">
                    <td className="py-2 text-growthos-text">{SCENARIO_LABELS[o.predictedScenario] || o.predictedScenario}</td>
                    <td className="py-2 text-growthos-text">₹{((o.predictedNetImpactMinor) / 100).toLocaleString("en-IN")}</td>
                    <td className="py-2 text-growthos-text">
                      {o.actualNetImpactMinor !== null ? `₹${((o.actualNetImpactMinor) / 100).toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="py-2 text-growthos-text">
                      {o.percentageError !== null ? `${o.percentageError.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.correctPrediction ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {o.correctPrediction ? "Yes" : "No"}
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
      {decision.relatedActions.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Related Actions</h3>
          <div className="space-y-2">
            {decision.relatedActions.map((a) => (
              <Link
                key={a.id}
                href={`/merchant/governance/actions/${a.id}`}
                className="flex items-center justify-between p-3 bg-growthos-bg border border-growthos-border rounded-lg hover:border-growthos-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    a.status === "APPROVED" ? "bg-green-500/10 text-green-400" :
                    a.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" :
                    a.status === "BLOCKED" ? "bg-red-500/10 text-red-400" :
                    "bg-gray-500/10 text-gray-400"
                  }`}>
                    {a.status}
                  </span>
                  <span className="text-sm text-growthos-text">₹{((a.amountMinor) / 100).toLocaleString("en-IN")}</span>
                </div>
                <span className="text-xs text-growthos-muted">{new Date(a.createdAt).toLocaleDateString("en-IN")}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
