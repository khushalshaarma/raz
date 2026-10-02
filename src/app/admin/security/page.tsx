"use client";

import { useEffect, useState } from "react";

interface SecurityData {
  blockedActions: Array<{
    id: string;
    merchantId: string;
    status: string;
    opportunityType: string;
    amountMinor: number;
    createdAt: string;
  }>;
  securityViolations: Array<{
    id: string;
    action: string;
    severity: string;
    details: string;
    createdAt: string;
    merchantId: string;
  }>;
  velocityViolations: Array<{
    id: string;
    action: string;
    severity: string;
    createdAt: string;
    merchantId: string;
  }>;
  emergencyStopActive: boolean;
  totalBlocked: number;
  totalCritical: number;
}

export default function AdminSecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emergencyStopLoading, setEmergencyStopLoading] = useState(false);

  useEffect(() => {
    async function fetchSecurity() {
      try {
        const res = await fetch("/api/admin/security");
        const d = await res.json();
        setData({
          blockedActions: d.blockedActions || [],
          securityViolations: d.securityViolations || [],
          velocityViolations: d.velocityViolations || [],
          emergencyStopActive: d.emergencyStopActive || false,
          totalBlocked: d.totalBlocked || 0,
          totalCritical: d.totalCritical || 0,
        });
      } catch {
        setError("Failed to load security data");
      } finally {
        setLoading(false);
      }
    }
    fetchSecurity();
  }, []);

  const handleEmergencyStop = async (enable: boolean) => {
    setEmergencyStopLoading(true);
    try {
      await fetch(`/api/admin/emergency-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable, reason: enable ? "Admin emergency stop" : "Admin disabled emergency stop" }),
      });
      setData(data ? { ...data, emergencyStopActive: enable } : data);
    } catch {
      setError("Emergency stop action failed");
    } finally {
      setEmergencyStopLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading security dashboard...</div></div>;
  }
  if (error) {
    return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>;
  }
  if (!data) return null;

  const sectionStyle: React.CSSProperties = { padding: "1rem", background: "#12121a", border: "1px solid #1e1e2e", borderRadius: "0.75rem" };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Security Dashboard</h1>
        <p className="text-growthos-muted text-sm mt-1">Admin security monitoring and controls</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-growthos-surface border border-red-500/20 rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Blocked Actions</div>
          <div className="text-2xl font-bold text-red-400 mt-2">{data.totalBlocked}</div>
        </div>
        <div className="p-5 bg-growthos-surface border border-red-500/20 rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Critical Violations</div>
          <div className="text-2xl font-bold text-red-400 mt-2">{data.totalCritical}</div>
        </div>
        <div className="p-5 bg-growthos-surface border border-yellow-500/20 rounded-xl">
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Velocity Violations</div>
          <div className="text-2xl font-bold text-yellow-400 mt-2">{data.velocityViolations.length}</div>
        </div>
        <div className={`p-5 bg-growthos-surface border rounded-xl ${data.emergencyStopActive ? "border-red-500/20" : "border-green-500/20"}`}>
          <div className="text-xs text-growthos-muted uppercase tracking-wider">Emergency Stop</div>
          <div className={`text-2xl font-bold mt-2 ${data.emergencyStopActive ? "text-red-400" : "text-green-400"}`}>
            {data.emergencyStopActive ? "ACTIVE" : "INACTIVE"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div style={sectionStyle}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-growthos-text">Blocked Actions</h2>
            <span className="text-xs text-growthos-muted">{data.blockedActions.length} recent</span>
          </div>
          {data.blockedActions.length === 0 ? (
            <div className="text-sm text-growthos-muted">No blocked actions.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.blockedActions.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 bg-growthos-bg rounded-lg text-sm">
                  <div>
                    <span className="text-growthos-text">{a.opportunityType}</span>
                    <span className="text-growthos-muted ml-2">{a.amountMinor} paise</span>
                  </div>
                  <span className="text-xs text-growthos-muted">{new Date(a.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-growthos-text">Security Violations</h2>
            <span className="text-xs text-growthos-muted">{data.securityViolations.length} critical</span>
          </div>
          {data.securityViolations.length === 0 ? (
            <div className="text-sm text-growthos-muted">No security violations.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.securityViolations.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-growthos-bg rounded-lg text-sm">
                  <div>
                    <span className="text-red-400">{v.action.replace(/_/g, " ")}</span>
                    <span className="text-growthos-muted ml-2">{v.merchantId?.slice(0, 8)}</span>
                  </div>
                  <span className="text-xs text-growthos-muted">{new Date(v.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-growthos-text">Velocity Violations</h2>
            <span className="text-xs text-growthos-muted">{data.velocityViolations.length}</span>
          </div>
          {data.velocityViolations.length === 0 ? (
            <div className="text-sm text-growthos-muted">No velocity violations.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.velocityViolations.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-growthos-bg rounded-lg text-sm">
                  <div>
                    <span className="text-yellow-400">{v.action.replace(/_/g, " ")}</span>
                    <span className="text-growthos-muted ml-2">{v.merchantId?.slice(0, 8)}</span>
                  </div>
                  <span className="text-xs text-growthos-muted">{new Date(v.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-growthos-text">Emergency Stop</h2>
            <span className={`text-xs font-medium ${data.emergencyStopActive ? "text-red-400" : "text-green-400"}`}>
              {data.emergencyStopActive ? "ACTIVE" : "INACTIVE"}
            </span>
          </div>
          {data.emergencyStopActive ? (
            <div className="space-y-3">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                Emergency stop is active. All automated actions are blocked.
              </div>
              <button
                onClick={() => handleEmergencyStop(false)}
                disabled={emergencyStopLoading}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                Disable Emergency Stop
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleEmergencyStop(true)}
              disabled={emergencyStopLoading}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Enable Emergency Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
