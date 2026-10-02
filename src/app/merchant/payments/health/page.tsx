"use client";

import { useEffect, useState } from "react";

interface PaymentHealth {
  successRate: number;
  failureRate: number;
  unknownCount: number;
  refundRate: number;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalRefunds: number;
  failureBreakdown: Array<{ category: string; count: number; percentage: number }>;
  webhookFailures: number;
  reconciliationBacklog: number;
}

export default function PaymentHealthPage() {
  const [health, setHealth] = useState<PaymentHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/payments/health")
      .then(r => r.json())
      .then(data => { setHealth(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-growthos-muted p-8">Loading...</div>;
  if (!health) return <div className="text-growthos-muted p-8">Failed to load payment health</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-growthos-text">Payment Health</h1>
        <p className="text-growthos-muted text-sm mt-1">Payment success rates and failure analysis</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <div className="text-growthos-muted text-xs uppercase tracking-wider">Success Rate</div>
          <div className="text-2xl font-bold text-green-400 mt-2">{health.successRate}%</div>
        </div>
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <div className="text-growthos-muted text-xs uppercase tracking-wider">Failure Rate</div>
          <div className="text-2xl font-bold text-red-400 mt-2">{health.failureRate}%</div>
        </div>
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <div className="text-growthos-muted text-xs uppercase tracking-wider">Total Payments</div>
          <div className="text-2xl font-bold text-growthos-text mt-2">{health.totalPayments}</div>
        </div>
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <div className="text-growthos-muted text-xs uppercase tracking-wider">Refund Rate</div>
          <div className="text-2xl font-bold text-yellow-400 mt-2">{health.refundRate}%</div>
        </div>
      </div>

      {health.failureBreakdown.length > 0 && (
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-growthos-muted uppercase tracking-wider mb-4">Failure Breakdown</h2>
          <div className="space-y-3">
            {health.failureBreakdown.map((fb) => (
              <div key={fb.category} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm text-growthos-text">{fb.category}</div>
                  <div className="w-full bg-growthos-bg rounded-full h-1.5 mt-1">
                    <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${fb.percentage}%` }} />
                  </div>
                </div>
                <div className="text-sm text-growthos-muted ml-4">{fb.count} ({fb.percentage}%)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <div className="text-growthos-muted text-xs uppercase tracking-wider">Webhook Failures</div>
          <div className="text-2xl font-bold text-growthos-text mt-2">{health.webhookFailures}</div>
        </div>
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <div className="text-growthos-muted text-xs uppercase tracking-wider">Reconciliation Backlog</div>
          <div className="text-2xl font-bold text-growthos-text mt-2">{health.reconciliationBacklog}</div>
        </div>
      </div>
    </div>
  );
}
