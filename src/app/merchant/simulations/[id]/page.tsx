"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type SimulationDetail = {
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
  baselineSnapshot: Record<string, unknown> | null;
  configSnapshot: Record<string, unknown> | null;
  scenarios: {
    id: string;
    scenarioType: string;
    eligibleCustomers: number;
    expectedConversionRate: number;
    expectedConversions: number;
    expectedRevenueMinor: number;
    expectedCostMinor: number;
    expectedNetImpactMinor: number;
    expectedROI: number;
    confidence: number;
    riskScore: number;
    riskLevel: string;
    evidence: string | null;
  }[];
  decisions: {
    id: string;
    decisionCategory: string;
    decisionScore: number;
    explanation: string;
    confidence: number;
    riskLevel: string;
    createdAt: string;
  }[];
  createdAt: string;
};

const SCENARIO_LABELS: Record<string, string> = {
  CONSERVATIVE: "Conservative",
  EXPECTED: "Expected",
  OPTIMISTIC: "Optimistic",
};

const CATEGORY_COLORS: Record<string, string> = {
  STRONG_RECOMMENDATION: "bg-green-500/10 text-green-400",
  RECOMMEND: "bg-blue-500/10 text-blue-400",
  LOW_CONFIDENCE_RECOMMENDATION: "bg-yellow-500/10 text-yellow-400",
  NO_CLEAR_WINNER: "bg-gray-500/10 text-gray-400",
  DO_NOT_ACT: "bg-red-500/10 text-red-400",
};

export default function SimulationDetailPage() {
  const { id } = useParams();
  const [sim, setSim] = useState<SimulationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/merchant/simulations/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSim(data.simulation);
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
        <div className="text-growthos-muted">Loading simulation...</div>
      </div>
    );
  }

  if (error || !sim) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/merchant/simulations" className="text-sm text-growthos-muted hover:text-growthos-accent">
          ← Back to simulations
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error || "Simulation not found"}
        </div>
      </div>
    );
  }

  const scoreColor =
    sim.decisionScore >= 80 ? "text-green-400" :
    sim.decisionScore >= 60 ? "text-yellow-400" :
    sim.decisionScore >= 40 ? "text-orange-400" : "text-red-400";

  const baseline = sim.baselineSnapshot as Record<string, unknown> | null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/merchant/simulations" className="text-sm text-growthos-muted hover:text-growthos-accent">
        ← Back to simulations
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-growthos-text">{sim.strategyName}</h1>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-400">SIMULATED</span>
      </div>
      <p className="text-sm text-growthos-muted">
        Created {new Date(sim.createdAt).toLocaleDateString("en-IN")} · {sim.scenarioLabel} scenario
      </p>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Decision Score</div>
          <div className={`text-3xl font-bold mt-1 ${scoreColor}`}>
            {sim.decisionScore}<span className="text-lg">/100</span>
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Confidence</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{Math.round(sim.confidence)}%</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Risk</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{sim.riskLevel}</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Recommended</div>
          <div className="text-2xl font-bold text-growthos-accent mt-1">{sim.scenarioLabel}</div>
        </div>
      </div>

      {/* Explanation */}
      {sim.explanation && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-2">Analysis</h3>
          <p className="text-sm text-growthos-muted leading-relaxed">{sim.explanation}</p>
        </div>
      )}

      {/* Scenario Comparison */}
      {sim.scenarios.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Scenario Comparison</h3>
          <div className="grid grid-cols-3 gap-4">
            {sim.scenarios.map((sc) => (
              <div
                key={sc.id}
                className={`p-4 bg-growthos-bg border rounded-xl ${
                  sc.scenarioType === sim.recommendedScenario
                    ? "border-growthos-accent/50"
                    : "border-growthos-border"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-growthos-text">
                    {SCENARIO_LABELS[sc.scenarioType] || sc.scenarioType}
                  </span>
                  {sc.scenarioType === sim.recommendedScenario && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-growthos-accent/10 text-growthos-accent">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-growthos-muted">Customers</span>
                    <span className="text-growthos-text">{sc.eligibleCustomers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-growthos-muted">Conversion</span>
                    <span className="text-growthos-text">{(sc.expectedConversionRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-growthos-muted">Revenue</span>
                    <span className="text-growthos-text">₹{((sc.expectedRevenueMinor) / 100).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-growthos-muted">Cost</span>
                    <span className="text-growthos-text">₹{((sc.expectedCostMinor) / 100).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-growthos-muted">Net Impact</span>
                    <span className={sc.expectedNetImpactMinor >= 0 ? "text-green-400" : "text-red-400"}>
                      ₹{((sc.expectedNetImpactMinor) / 100).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-growthos-muted">ROI</span>
                    <span className="text-growthos-text">{sc.expectedROI.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-growthos-muted">Risk Score</span>
                    <span className="text-growthos-text">{sc.riskScore}/100</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Baseline */}
      {baseline && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Baseline Data</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {Object.entries(baseline).map(([key, value]) => (
              <div key={key}>
                <div className="text-growthos-muted">{key.replace(/([A-Z])/g, " $1").trim()}</div>
                <div className="text-growthos-text font-medium">
                  {typeof value === "number" ? value.toLocaleString("en-IN") : String(value ?? "—")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision History */}
      {sim.decisions.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Decision History</h3>
          <div className="space-y-3">
            {sim.decisions.map((d) => (
              <div key={d.id} className="p-3 bg-growthos-bg border border-growthos-border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[d.decisionCategory] || "bg-gray-500/10 text-gray-400"}`}>
                    {d.decisionCategory.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm text-growthos-text font-medium">Score: {d.decisionScore}/100</span>
                  <span className="text-xs text-growthos-muted">
                    {new Date(d.createdAt).toLocaleDateString("en-IN")}
                  </span>
                </div>
                {d.explanation && (
                  <p className="text-sm text-growthos-muted mt-2">{d.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
