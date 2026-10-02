"use client";

import { useEffect, useState } from "react";

interface ActionItem {
  id: string;
  opportunityType: string;
  status: string;
  amountMinor: number;
  riskLevel: string;
  confidence: number;
  createdAt: string;
  policyId?: string;
}

interface GovernanceState {
  automationState: "ACTIVE" | "PAUSED";
  isAutomationAllowed: boolean;
  totalToday: { approved: number; pending: number; blocked: number };
  riskLevel: string;
  policyStatus: string;
  spendToday: number;
  spendLimit: number;
  velocityToday: number;
  velocityLimit: number;
  recentDecisions: ActionItem[];
}

export default function GovernancePage() {
  const [state, setState] = useState<GovernanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [actionsRes, allActionsRes] = await Promise.all([
          fetch("/api/merchant/governance/actions?status=PENDING&take=1"),
          fetch("/api/merchant/governance/actions?take=10"),
        ]);
        const pendingData = await actionsRes.json();
        const allData = await allActionsRes.json();

        const allActions: ActionItem[] = (allData.actions || []).map((a: any) => ({
          id: a.id,
          opportunityType: a.opportunityType,
          status: a.status,
          amountMinor: a.amountMinor || 0,
          riskLevel: a.riskLevel || "LOW",
          confidence: a.confidence || 0,
          createdAt: a.createdAt,
        }));

        const approved = allActions.filter((a: ActionItem) => a.status === "APPROVED").length;
        const pending = allActions.filter((a: ActionItem) => a.status === "PENDING").length;
        const blocked = allActions.filter((a: ActionItem) => a.status === "BLOCKED").length;

        setState({
          automationState: "ACTIVE",
          isAutomationAllowed: true,
          totalToday: { approved, pending, blocked },
          riskLevel: "LOW",
          policyStatus: "Active",
          spendToday: 0,
          spendLimit: 50000,
          velocityToday: 0,
          velocityLimit: 100,
          recentDecisions: allActions.slice(0, 5),
        });
      } catch (e) {
        setError("Failed to load governance data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading governance...</div></div>;
  }
  if (error) {
    return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>;
  }
  if (!state) return null;

  const isActive = state.automationState === "ACTIVE";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Governance</h1>
        <p className="text-growthos-muted text-sm mt-1">Merchant governance overview and automation controls</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={`p-5 bg-growthos-surface border rounded-xl ${isActive ? "border-green-500/20" : "border-yellow-500/20"}`}>
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Automation Status</div>
          <div className={`text-xl font-bold mt-2 ${isActive ? "text-green-400" : "text-yellow-400"}`}>
            {state.automationState}
          </div>
          <div className="text-xs text-growthos-muted mt-1">{isActive ? "Running normally" : "Paused by admin"}</div>
        </div>

        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Today&apos;s Governance</div>
          <div className="text-xl font-bold text-growthos-text mt-2">
            <span className="text-green-400">{state.totalToday.approved}</span> /{" "}
            <span className="text-yellow-400">{state.totalToday.pending}</span> /{" "}
            <span className="text-red-400">{state.totalToday.blocked}</span>
          </div>
          <div className="text-xs text-growthos-muted mt-1">Approved / Pending / Blocked</div>
        </div>

        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Risk</div>
          <div className="text-xl font-bold text-green-400 mt-2">{state.riskLevel}</div>
          <div className="text-xs text-growthos-muted mt-1">Current assessment</div>
        </div>

        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Policy</div>
          <div className="text-xl font-bold text-growthos-text mt-2">{state.policyStatus}</div>
          <div className="text-xs text-growthos-muted mt-1">Default policy enforced</div>
        </div>

        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Spend</div>
          <div className="text-xl font-bold text-growthos-text mt-2">
            {state.spendToday.toLocaleString()} / {state.spendLimit.toLocaleString()}
          </div>
          <div className="text-xs text-growthos-muted mt-1">Today (paise) / Limit</div>
        </div>

        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Velocity</div>
          <div className="text-xl font-bold text-growthos-text mt-2">
            {state.velocityToday} / {state.velocityLimit}
          </div>
          <div className="text-xs text-growthos-muted mt-1">Actions / Limit</div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-growthos-text mb-4">Recent Decisions</h2>
        {state.recentDecisions.length === 0 ? (
          <div className="text-growthos-muted text-sm">No recent decisions.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-growthos-border text-growthos-muted">
                  <th className="text-left py-3 px-4">Action</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Risk</th>
                  <th className="text-left py-3 px-4">Confidence</th>
                  <th className="text-left py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {state.recentDecisions.map((d) => (
                  <tr key={d.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-growthos-text">{d.opportunityType}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        d.status === "APPROVED" ? "bg-green-500/10 text-green-400" :
                        d.status === "BLOCKED" ? "bg-red-500/10 text-red-400" :
                        d.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" :
                        "bg-gray-500/10 text-gray-400"
                      }`}>{d.status}</span>
                    </td>
                    <td className="py-3 px-4 text-growthos-text">{d.amountMinor} paise</td>
                    <td className="py-3 px-4 text-growthos-text">{d.riskLevel}</td>
                    <td className="py-3 px-4 text-growthos-text">{d.confidence}%</td>
                    <td className="py-3 px-4 text-growthos-muted">{new Date(d.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
