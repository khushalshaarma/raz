"use client";

import { useEffect, useState } from "react";

export default function MerchantAuditPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/audit")
      .then((r) => r.json())
      .then((d) => setEvents(d.auditLogs || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Audit Trail</h1>
        <p className="text-growthos-muted text-sm mt-1">History of important actions</p>
      </div>

      {events.length === 0 ? (
        <div className="text-growthos-muted text-sm">No audit events yet.</div>
      ) : (
        <div className="space-y-2">
          {events.map((e: any) => (
            <div key={e.id} className="p-4 bg-growthos-surface border border-growthos-border rounded-lg flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                e.severity === "CRITICAL" || e.severity === "ERROR" ? "bg-red-400" :
                e.severity === "WARNING" ? "bg-yellow-400" :
                "bg-green-400"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-growthos-text font-medium">{e.action.replace(/_/g, " ")}</div>
                <div className="text-xs text-growthos-muted">
                  {/* `AuditLog` records an outcome, not an actorType. */}
                  {e.resourceType && `${e.resourceType}`}
                  {e.outcome && ` - ${e.outcome}`}
                </div>
              </div>
              <div className="text-xs text-growthos-muted flex-shrink-0">
                {new Date(e.createdAt).toLocaleString("en-IN")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
