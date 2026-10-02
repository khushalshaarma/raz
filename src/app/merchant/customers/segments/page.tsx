"use client";

import { useEffect, useState } from "react";

interface Segment {
  id: string;
  name: string;
  description: string;
  customerCount: number;
  revenue: number;
  formattedRevenue: string;
  averageOrderValue: number;
  purchaseFrequency: number;
  trend: string;
}

export default function CustomerIntelligence() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/customers/segments")
      .then(r => r.json())
      .then(data => { setSegments(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-growthos-muted p-8">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-growthos-text">Customer Intelligence</h1>
        <p className="text-growthos-muted text-sm mt-1">Customer segments and behavior analysis</p>
      </div>

      {segments.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-growthos-muted text-4xl mb-4">○</div>
          <h3 className="text-growthos-text font-medium text-lg">No customer segments yet</h3>
          <p className="text-growthos-muted text-sm mt-1">Customer segments will appear once you have orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map((seg) => (
            <div key={seg.id} className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-growthos-text font-medium">{seg.name}</h3>
                <span className="text-growthos-accent font-bold">{seg.customerCount}</span>
              </div>
              <p className="text-growthos-muted text-xs mb-4">{seg.description}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-growthos-muted text-xs">Revenue</div>
                  <div className="text-growthos-text font-medium">{seg.formattedRevenue}</div>
                </div>
                <div>
                  <div className="text-growthos-muted text-xs">Avg Order</div>
                  <div className="text-growthos-text font-medium">₹{(seg.averageOrderValue / 100).toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-growthos-muted text-xs">Frequency</div>
                  <div className="text-growthos-text font-medium">{seg.purchaseFrequency}x</div>
                </div>
                <div>
                  <div className="text-growthos-muted text-xs">Trend</div>
                  <div className={`font-medium ${seg.trend === "GROWING" ? "text-green-400" : seg.trend === "DECLINING" ? "text-red-400" : "text-growthos-muted"}`}>
                    {seg.trend}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
