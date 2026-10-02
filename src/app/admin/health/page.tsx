"use client";

import { useEffect, useState } from "react";

export default function AdminHealthPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/system/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.health))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Checking system health...</div></div>;
  }

  if (!health) {
    return <div className="text-growthos-muted text-sm">System health unavailable.</div>;
  }

  const items = [
    { label: "Application", value: health.application },
    { label: "API", value: health.api },
    { label: "Database", value: health.database },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">System Health</h1>
        <p className="text-growthos-muted text-sm mt-1">Application infrastructure status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label} className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">{item.label}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2 h-2 rounded-full ${
                item.value === "ok" ? "bg-green-400" : item.value === "degraded" ? "bg-yellow-400" : "bg-red-400"
              }`} />
              <span className="text-growthos-text font-medium capitalize">{item.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="text-sm text-growthos-muted">
        Environment: <span className="text-growthos-text">{health.environment}</span> · Last checked: {new Date(health.lastCheckedAt).toLocaleString("en-IN")}
      </div>
    </div>
  );
}
