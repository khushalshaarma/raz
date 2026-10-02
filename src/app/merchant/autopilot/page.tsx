"use client";

import { useEffect, useState } from "react";

interface AutopilotConfig {
  mode: string;
  config: {
    maxDailySpendMinor: number;
    maxCampaignSpendMinor: number;
    maxCustomerSpendMinor: number;
    maxActionsPerHour: number;
    maxActionsPerDay: number;
    minimumConfidence: number;
    maximumRisk: number;
    approvalRequiredAboveMinor: number;
  };
  isActive: boolean;
}

export default function AutopilotPage() {
  const [config, setConfig] = useState<AutopilotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/merchant/autopilot")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateMode = async (mode: string) => {
    setSaving(true);
    await fetch("/api/merchant/autopilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, isActive: mode !== "OFF" }),
    });
    const res = await fetch("/api/merchant/autopilot");
    const data = await res.json();
    setConfig(data.config);
    setSaving(false);
  };

  const stopAutopilot = async () => {
    setSaving(true);
    await fetch("/api/merchant/autopilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    const res = await fetch("/api/merchant/autopilot");
    const data = await res.json();
    setConfig(data.config);
    setSaving(false);
  };

  if (loading) return <div className="p-8">Loading...</div>;

  const modeColors: Record<string, string> = {
    OFF: "bg-gray-100 text-gray-700",
    REVIEW: "bg-yellow-100 text-yellow-700",
    LIMITED: "bg-blue-100 text-blue-700",
    FULL: "bg-green-100 text-green-700",
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Autopilot</h1>

      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Autopilot Status</h2>
            <p className="text-sm text-gray-500">Current mode: {config?.mode ?? "OFF"}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${modeColors[config?.mode ?? "OFF"]}`}>
            {config?.mode ?? "OFF"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {["OFF", "REVIEW", "LIMITED", "FULL"].map((mode) => (
            <button
              key={mode}
              onClick={() => updateMode(mode)}
              disabled={saving || config?.mode === mode}
              className={`p-3 rounded-lg border text-left ${
                config?.mode === mode ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
              } ${saving ? "opacity-50" : ""}`}
            >
              <div className="font-medium">{mode}</div>
              <div className="text-xs text-gray-500">
                {mode === "OFF" && "No autonomous actions"}
                {mode === "REVIEW" && "Requires merchant approval"}
                {mode === "LIMITED" && "Limited autonomous actions"}
                {mode === "FULL" && "Full autonomy (governance still applies)"}
              </div>
            </button>
          ))}
        </div>

        {config?.mode !== "OFF" && (
          <button
            onClick={stopAutopilot}
            disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
          >
            Stop Autopilot
          </button>
        )}
      </div>

      {config?.mode !== "OFF" && config && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold mb-4">Limits</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Max Daily Spend:</span>
              <span className="ml-2 font-medium">₹{Math.round((config.config.maxDailySpendMinor) / 100)}</span>
            </div>
            <div>
              <span className="text-gray-500">Max Campaign Spend:</span>
              <span className="ml-2 font-medium">₹{Math.round((config.config.maxCampaignSpendMinor) / 100)}</span>
            </div>
            <div>
              <span className="text-gray-500">Max Customer Spend:</span>
              <span className="ml-2 font-medium">₹{Math.round((config.config.maxCustomerSpendMinor) / 100)}</span>
            </div>
            <div>
              <span className="text-gray-500">Max Actions/Hour:</span>
              <span className="ml-2 font-medium">{config.config.maxActionsPerHour}</span>
            </div>
            <div>
              <span className="text-gray-500">Max Actions/Day:</span>
              <span className="ml-2 font-medium">{config.config.maxActionsPerDay}</span>
            </div>
            <div>
              <span className="text-gray-500">Min Confidence:</span>
              <span className="ml-2 font-medium">{config.config.minimumConfidence}%</span>
            </div>
            <div>
              <span className="text-gray-500">Max Risk:</span>
              <span className="ml-2 font-medium">{config.config.maximumRisk}%</span>
            </div>
            <div>
              <span className="text-gray-500">Approval Above:</span>
              <span className="ml-2 font-medium">₹{Math.round((config.config.approvalRequiredAboveMinor) / 100)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
