"use client";

import { useEffect, useState } from "react";

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  status: string;
}

export default function GrowthTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/timeline")
      .then(r => r.json())
      .then(data => { setEvents(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-growthos-muted p-8">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-growthos-text">Growth Timeline</h1>
        <p className="text-growthos-muted text-sm mt-1">Complete history of your GrowthOS activity</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-growthos-muted text-4xl mb-4">○</div>
          <h3 className="text-growthos-text font-medium text-lg">No activity yet</h3>
          <p className="text-growthos-muted text-sm mt-1">Timeline will populate as GrowthOS works on your behalf</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-growthos-border" />
          <div className="space-y-6">
            {events.map((event) => (
              <div key={event.id} className="flex gap-4 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                  event.status === "SUCCESS" ? "bg-green-500/20 text-green-400" :
                  event.status === "FAILED" ? "bg-red-500/20 text-red-400" :
                  event.status === "PENDING" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-growthos-surface text-growthos-muted"
                }`}>
                  {event.status === "SUCCESS" ? "✓" : event.status === "FAILED" ? "✗" : event.status === "PENDING" ? "◦" : "—"}
                </div>
                <div className="flex-1 bg-growthos-surface border border-growthos-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium text-growthos-text">{event.title}</h3>
                    <span className="text-xs text-growthos-muted">{new Date(event.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="text-xs text-growthos-muted">{event.description}</p>
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-white/5 text-growthos-muted">{event.type.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
