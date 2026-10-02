"use client";

import { useEffect, useState } from "react";

interface EvidenceItem {
  feature: string;
  value: string;
}

interface GovernanceReasoning {
  actionRequestId: string;
  actionType: string;
  strategyId: string;
  decision: string;
  decisionReason: string;
  riskLevel: string;
  riskScore: number;
  confidence: number;
  dataQualityScore: number;
  securityScore: number;
  securityLevel: string;
  policyId: string;
  matchedRules: Array<{ ruleKey: string; ruleValue: number; operator: string }>;
  approvalDecision: string;
  requiresFourEyes: boolean;
  requiredRole: string;
  status: string;
  createdAt: string;
  evidence?: string;
}

export default function ActionDetailPage() {
  const [data, setData] = useState<GovernanceReasoning | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchAction() {
      try {
        const pathname = window.location.pathname;
        const id = pathname.split("/").pop();
        const res = await fetch(`/api/merchant/governance/actions/${id}`);
        if (res.ok) {
          const d = await res.json();
          const action = d.actionRequest;
          setData({
            actionRequestId: action.id,
            actionType: action.opportunityType,
            strategyId: action.strategyId,
            decision: action.status,
            decisionReason: action.reason || "No reason provided",
            riskLevel: action.riskLevel || "LOW",
            riskScore: action.decisionScore || 0,
            confidence: action.confidence || 0,
            dataQualityScore: 0,
            securityScore: 0,
            securityLevel: "SECURE",
            policyId: action.policyId || "default",
            matchedRules: [],
            approvalDecision: action.status === "APPROVED" ? "APPROVED" : action.status === "BLOCKED" ? "BLOCKED" : "PENDING",
            requiresFourEyes: false,
            requiredRole: "MERCHANT",
            status: action.status,
            createdAt: action.createdAt,
          });
        } else {
          setError("Action request not found");
        }
      } catch {
        setError("Failed to load action details");
      } finally {
        setLoading(false);
      }
    }
    fetchAction();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading action details...</div></div>;
  }
  if (error) {
    return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>;
  }
  if (!data) return null;

  const sectionStyle: React.CSSProperties = { padding: "1rem", background: "var(--surface, #12121a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: "0.75rem" };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Action Detail</h1>
        <p className="text-growthos-muted text-sm mt-1">Governance reasoning for action {data.actionRequestId.slice(0, 8)}</p>
      </div>

      <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-growthos-text font-medium text-lg">{data.actionType}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            data.status === "APPROVED" ? "bg-green-500/10 text-green-400" :
            data.status === "BLOCKED" ? "bg-red-500/10 text-red-400" :
            "bg-yellow-500/10 text-yellow-400"
          }`}>{data.status}</span>
        </div>
        <p className="text-sm text-growthos-muted">{data.decisionReason}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Action</h3>
          <div className="text-sm text-growthos-text">{data.actionType}</div>
          <div className="text-xs text-growthos-muted mt-1">Strategy: {data.strategyId}</div>
        </div>

        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Decision</h3>
          <div className="text-sm text-growthos-text">{data.decision}</div>
          <div className="text-xs text-growthos-muted mt-1">{data.decisionReason}</div>
        </div>

        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Data Quality</h3>
          <div className="text-sm text-growthos-text">{data.dataQualityScore}/100</div>
        </div>

        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Confidence</h3>
          <div className="text-sm text-growthos-text">{data.confidence}%</div>
        </div>

        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Risk</h3>
          <div className={`text-sm ${data.riskLevel === "HIGH" ? "text-red-400" : data.riskLevel === "MEDIUM" ? "text-yellow-400" : "text-green-400"}`}>
            {data.riskLevel} ({data.riskScore}/100)
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Security</h3>
          <div className={`text-sm ${data.securityLevel === "SECURE" ? "text-green-400" : data.securityLevel === "SUSPICIOUS" ? "text-yellow-400" : "text-red-400"}`}>
            {data.securityLevel} ({data.securityScore}/100)
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Policy</h3>
          <div className="text-sm text-growthos-text">{data.policyId}</div>
        </div>

        <div style={sectionStyle}>
          <h3 className="text-sm font-semibold text-growthos-text mb-3">Approval</h3>
          <div className="text-sm text-growthos-text">{data.approvalDecision}</div>
          <div className="text-xs text-growthos-muted mt-1">
            {data.requiresFourEyes ? `4-Eyes required (${data.requiredRole})` : "No approval needed"}
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 className="text-sm font-semibold text-growthos-text mb-3">Matched Rules</h3>
        {data.matchedRules.length > 0 ? (
          <div className="space-y-1">
            {data.matchedRules.map((r, i) => (
              <div key={i} className="text-sm text-growthos-muted">{r.ruleKey} ({r.operator}) {r.ruleValue}</div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-growthos-muted">No matched rules</div>
        )}
      </div>

      <div style={sectionStyle}>
        <h3 className="text-sm font-semibold text-growthos-text mb-3">Final Result</h3>
        <div className="text-sm text-growthos-text">{data.decision}</div>
      </div>

      <div style={sectionStyle}>
        <h3 className="text-sm font-semibold text-growthos-text mb-3">Audit Trail</h3>
        <div className="text-xs text-growthos-muted space-y-1">
          <div>Decision: {data.decision} at {new Date(data.createdAt).toLocaleString("en-IN")}</div>
          <div>Action ID: {data.actionRequestId}</div>
        </div>
      </div>
    </div>
  );
}
