"use client";

import { useEffect, useState } from "react";

interface PolicyRule {
  ruleKey: string;
  ruleValue: number;
  operator: string;
}

interface PolicyData {
  id: string;
  name: string;
  conditionType: string;
  conditionOperator: string;
  conditionValue: number;
  action: string;
  priority: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  matchedRules: PolicyRule[];
  violations: Array<{ ruleKey: string; reasonCode: string }>;
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyData | null>(null);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newPolicyCondition, setNewPolicyCondition] = useState("RISK_SCORE");
  const [newPolicyOperator, setNewPolicyOperator] = useState("LTE");
  const [newPolicyValue, setNewPolicyValue] = useState(70);
  const [newPolicyAction, setNewPolicyAction] = useState("BLOCK");

  useEffect(() => {
    async function fetchPolicies() {
      try {
        const res = await fetch("/api/policies");
        const data = await res.json();
        setPolicies(data.policies || []);
      } catch {
        try {
          const res = await fetch("/api/merchant/policies");
          const data = await res.json();
          setPolicies(data.policies || []);
        } catch {
          setPolicies([]);
        }
      }
      setLoading(false);
    }
    fetchPolicies();
  }, []);

  const handleCreatePolicy = async () => {
    if (!newPolicyName) return;
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPolicyName,
          conditionType: newPolicyCondition,
          conditionOperator: newPolicyOperator,
          conditionValue: Number(newPolicyValue),
          action: newPolicyAction,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPolicies([...policies, data.policy]);
        setShowCreate(false);
        setNewPolicyName("");
      }
    } catch (e) {
      setError("Failed to create policy");
    }
  };

  const handleTogglePolicy = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/policies/${id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) });
      setPolicies(policies.map((p) => p.id === id ? { ...p, isActive } : p));
    } catch {
      setError("Failed to update policy");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading policies...</div></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-growthos-text">Policies</h1>
          <p className="text-growthos-muted text-sm mt-1">Create and manage governance policies</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-growthos-accent text-white rounded-lg text-sm font-medium hover:bg-growthos-accent/80">
          Create Policy
        </button>
      </div>

      {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      {showCreate && (
        <div className="p-6 bg-growthos-surface border border-growthos-border rounded-xl space-y-4">
          <h2 className="text-lg font-semibold text-growthos-text">Create Policy</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-growthos-muted block mb-1">Policy Name</label>
              <input type="text" value={newPolicyName} onChange={(e) => setNewPolicyName(e.target.value)} className="w-full px-3 py-2 bg-growthos-bg border border-growthos-border rounded-lg text-growthos-text text-sm" placeholder="My Policy" />
            </div>
            <div>
              <label className="text-xs text-growthos-muted block mb-1">Condition Type</label>
              <select value={newPolicyCondition} onChange={(e) => setNewPolicyCondition(e.target.value)} className="w-full px-3 py-2 bg-growthos-bg border border-growthos-border rounded-lg text-growthos-text text-sm">
                <option value="RISK_SCORE">Risk Score</option>
                <option value="CONFIDENCE_SCORE">Confidence Score</option>
                <option value="DATA_QUALITY">Data Quality</option>
                <option value="SPEND">Spend</option>
                <option value="VELOCITY">Velocity</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-growthos-muted block mb-1">Operator</label>
              <select value={newPolicyOperator} onChange={(e) => setNewPolicyOperator(e.target.value)} className="w-full px-3 py-2 bg-growthos-bg border border-growthos-border rounded-lg text-growthos-text text-sm">
                <option value="LTE">LTE</option>
                <option value="GTE">GTE</option>
                <option value="EQ">EQ</option>
                <option value="GT">GT</option>
                <option value="LT">LT</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-growthos-muted block mb-1">Threshold Value</label>
              <input type="number" value={newPolicyValue} onChange={(e) => setNewPolicyValue(Number(e.target.value))} className="w-full px-3 py-2 bg-growthos-bg border border-growthos-border rounded-lg text-growthos-text text-sm" />
            </div>
            <div>
              <label className="text-xs text-growthos-muted block mb-1">Action</label>
              <select value={newPolicyAction} onChange={(e) => setNewPolicyAction(e.target.value)} className="w-full px-3 py-2 bg-growthos-bg border border-growthos-border rounded-lg text-growthos-text text-sm">
                <option value="BLOCK">Block</option>
                <option value="ALLOW">Allow</option>
                <option value="REQUIRE_APPROVAL">Require Approval</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreatePolicy} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      {selectedPolicy && (
        <div className="p-6 bg-growthos-surface border border-growthos-border rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-growthos-text">{selectedPolicy.name} - Details</h2>
            <button onClick={() => setSelectedPolicy(null)} className="text-growthos-muted hover:text-growthos-text text-sm">Close</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-growthos-muted">Version:</span> <span className="text-growthos-text">{selectedPolicy.version}</span></div>
            <div><span className="text-growthos-muted">Status:</span> <span className={selectedPolicy.isActive ? "text-green-400" : "text-red-400"}>{selectedPolicy.isActive ? "Active" : "Inactive"}</span></div>
            <div><span className="text-growthos-muted">Condition:</span> <span className="text-growthos-text">{selectedPolicy.conditionType} {selectedPolicy.conditionOperator} {selectedPolicy.conditionValue}</span></div>
            <div><span className="text-growthos-muted">Action:</span> <span className="text-growthos-text">{selectedPolicy.action}</span></div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-growthos-text mb-2">Matched Rules</h3>
            {selectedPolicy.matchedRules.length > 0 ? (
              <div className="space-y-1">
                {selectedPolicy.matchedRules.map((r, i) => (
                  <div key={i} className="text-sm text-growthos-muted">{r.ruleKey} {r.operator} {r.ruleValue}</div>
                ))}
              </div>
            ) : <div className="text-sm text-growthos-muted">No matched rules</div>}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-growthos-border text-growthos-muted">
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Condition</th>
              <th className="text-left py-3 px-4">Version</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 ? (
              <tr><td colSpan={5} className="py-4 px-4 text-growthos-muted text-sm">No policies created.</td></tr>
            ) : (
              policies.map((p) => (
                <tr key={p.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                  <td className="py-3 px-4 text-growthos-text font-medium">{p.name}</td>
                  <td className="py-3 px-4 text-growthos-muted">{p.conditionType} {p.conditionOperator} {p.conditionValue}</td>
                  <td className="py-3 px-4 text-growthos-text">v{p.version}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 flex gap-2">
                    <button onClick={() => handleTogglePolicy(p.id, !p.isActive)} className="px-2 py-1 text-xs rounded border border-growthos-border text-growthos-muted hover:text-growthos-text">
                      {p.isActive ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => setSelectedPolicy(p)} className="px-2 py-1 text-xs rounded border border-growthos-border text-growthos-muted hover:text-growthos-text">
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
