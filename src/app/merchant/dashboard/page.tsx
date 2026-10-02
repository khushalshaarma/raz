"use client";

import { useCallback, useEffect, useState } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import { GrowthScoreDisplay } from "@/components/ui/GrowthScoreDisplay";
import {
  normalizeMerchantOverview,
  type MerchantOverview,
} from "@/lib/product/overview-contract";

interface GrowthScoreDimension {
  name: string;
  score: number;
  weight: number;
  evidence: string;
  trend: string;
}

interface GrowthScore {
  growthScore: number;
  growthLevel: string;
  dimensions?: GrowthScoreDimension[];
}

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  status: string;
}

/**
 * Error thrown for any non-2xx response or non-JSON body.
 *
 * Previously this page did `fetch(url).then(r => r.json())` without checking
 * `r.ok`, so an error envelope such as `{ error: "Merchant not found" }` was
 * stored in state as if it were a valid payload. `if (!overview)` did not catch
 * it (the object is truthy) and the render then crashed with
 * "Cannot read properties of undefined (reading 'totalRuns')".
 */
class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function requestJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ApiRequestError("Could not reach the server. Check your connection.", 0);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError(
      response.ok ? "The server returned an unreadable response." : "Request failed.",
      response.status
    );
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new ApiRequestError(message, response.status);
  }

  return body;
}

export default function MerchantDashboard() {
  const [overview, setOverview] = useState<MerchantOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [growthScore, setGrowthScore] = useState<GrowthScore | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setOverviewError(null);

    // The overview is the critical payload: a failure here is surfaced to the
    // user as an error state rather than being rendered as fake data.
    try {
      const [ov, gs, tl] = await Promise.all([
        requestJson("/api/merchant/overview"),
        requestJson("/api/merchant/growth-score").catch(() => null),
        requestJson("/api/merchant/timeline?limit=10").catch(() => null),
      ]);

      // Normalize defensively so an unexpectedly missing optional field can
      // never crash the dashboard.
      setOverview(normalizeMerchantOverview(ov));
      setGrowthScore((gs as GrowthScore | null) ?? null);
      setTimeline(Array.isArray(tl) ? (tl as TimelineEvent[]) : []);
    } catch (error) {
      setOverview(null);
      setOverviewError(
        error instanceof ApiRequestError ? error.message : "Failed to load overview"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="text-growthos-muted p-8">Loading...</div>;

  if (overviewError || !overview) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
          <h2 className="text-sm font-medium text-red-400 mb-2">
            Could not load your dashboard
          </h2>
          <p className="text-sm text-growthos-muted mb-4">
            {overviewError ?? "Failed to load overview"}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-1.5 rounded-lg border border-growthos-border text-sm text-growthos-text hover:bg-growthos-surface"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const dimensions = Array.isArray(growthScore?.dimensions) ? growthScore.dimensions : [];
  const agentActivity = overview.agentActivity;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-growthos-text">Command Center</h1>
        <p className="text-growthos-muted text-sm mt-1">Your business at a glance</p>
      </div>

      {overview.riskAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {overview.riskAlerts.map((alert, i) => (
            <div key={i} className={`p-3 rounded-lg border text-sm ${
              alert.severity === "HIGH" ? "bg-red-500/10 border-red-500/20 text-red-400" :
              alert.severity === "MEDIUM" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" :
              "bg-blue-500/10 border-blue-500/20 text-blue-400"
            }`}>
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {growthScore && (
        <div className="mb-6">
          <GrowthScoreDisplay score={growthScore.growthScore} level={growthScore.growthLevel} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Revenue" value={overview.revenue.formattedValue} comparison={overview.revenue.comparison} trend={overview.revenue.trend} source={overview.revenue.source} />
        <MetricCard label="Orders" value={overview.orders.formattedValue} comparison={overview.orders.comparison} trend={overview.orders.trend} source={overview.orders.source} />
        <MetricCard label="Customers" value={overview.customers.formattedValue} comparison={overview.customers.comparison} trend={overview.customers.trend} source={overview.customers.source} />
        <MetricCard label="Conversion" value={overview.conversion.formattedValue} comparison={overview.conversion.comparison} trend={overview.conversion.trend} source={overview.conversion.source} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Avg Order Value" value={overview.averageOrderValue.formattedValue} comparison={overview.averageOrderValue.comparison} trend={overview.averageOrderValue.trend} compact />
        <MetricCard label="Repeat Customers" value={overview.repeatCustomerRate.formattedValue} comparison={overview.repeatCustomerRate.comparison} trend={overview.repeatCustomerRate.trend} compact />
        <MetricCard label="Payment Success" value={overview.paymentSuccessRate.formattedValue} comparison={overview.paymentSuccessRate.comparison} trend={overview.paymentSuccessRate.trend} compact />
        <MetricCard label="Opportunities" value={overview.growthOpportunities.toString()} compact />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-growthos-muted uppercase tracking-wider mb-4">Growth Score Breakdown</h2>
          {dimensions.length === 0 ? (
            <div className="text-growthos-muted text-sm py-8 text-center">No growth score yet</div>
          ) : (
            dimensions.map((dim) => (
              <div key={dim.name} className="flex items-center justify-between py-2 border-b border-growthos-border/50 last:border-0">
                <div className="flex-1">
                  <div className="text-sm text-growthos-text">{dim.name}</div>
                  <div className="text-xs text-growthos-muted mt-0.5">{dim.evidence}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${dim.trend === "IMPROVING" ? "text-green-400" : dim.trend === "DECLINING" ? "text-red-400" : "text-growthos-muted"}`}>
                    {dim.trend === "IMPROVING" ? "↑" : dim.trend === "DECLINING" ? "↓" : "—"}
                  </span>
                  <span className="text-sm font-medium text-growthos-text w-8 text-right">{dim.score}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-growthos-muted uppercase tracking-wider mb-4">Activity Timeline</h2>
          {timeline.length === 0 ? (
            <div className="text-growthos-muted text-sm py-8 text-center">No activity yet</div>
          ) : (
            <div className="space-y-3">
              {timeline.slice(0, 8).map((event) => (
                <div key={event.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    event.status === "SUCCESS" ? "bg-green-400" :
                    event.status === "FAILED" ? "bg-red-400" :
                    event.status === "PENDING" ? "bg-yellow-400" : "bg-growthos-muted"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-growthos-text truncate">{event.title}</div>
                    <div className="text-xs text-growthos-muted truncate">{event.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-growthos-text">{overview.pendingApprovals}</div>
          <div className="text-xs text-growthos-muted mt-1">Pending Approvals</div>
        </div>
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-growthos-text">{overview.recentExecutions}</div>
          <div className="text-xs text-growthos-muted mt-1">Recent Executions</div>
        </div>
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-growthos-text">{agentActivity.totalRuns}</div>
          <div className="text-xs text-growthos-muted mt-1">Agent Runs</div>
        </div>
        <div className="bg-growthos-surface border border-growthos-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-growthos-text">{agentActivity.successRate.toFixed(0)}%</div>
          <div className="text-xs text-growthos-muted mt-1">Agent Success Rate</div>
        </div>
      </div>

      <div className="mt-6 bg-growthos-surface border border-growthos-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-growthos-muted uppercase tracking-wider mb-4">AI Buyer Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-growthos-text">{overview.aiBuyerActivity.totalRequests}</div>
            <div className="text-xs text-growthos-muted mt-1">Total Requests</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-growthos-text">{overview.aiBuyerActivity.pendingApprovals}</div>
            <div className="text-xs text-growthos-muted mt-1">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-growthos-text">{overview.aiBuyerActivity.approvedPurchases}</div>
            <div className="text-xs text-growthos-muted mt-1">Approved</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-growthos-text">{overview.aiBuyerActivity.checkoutStarted}</div>
            <div className="text-xs text-growthos-muted mt-1">Checkout Started</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-growthos-text">{overview.aiBuyerActivity.successfulPurchases}</div>
            <div className="text-xs text-growthos-muted mt-1">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-growthos-text">{overview.aiBuyerActivity.rejectedPurchases}</div>
            <div className="text-xs text-growthos-muted mt-1">Failed</div>
          </div>
        </div>
        {overview.aiBuyerActivity.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {overview.aiBuyerActivity.recentActivity.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  item.status === "APPROVED" ? "bg-green-400" :
                  item.status === "PENDING" ? "bg-yellow-400" :
                  item.status === "REJECTED" ? "bg-red-400" : "bg-growthos-muted"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-growthos-text truncate">{item.query}</div>
                  <div className="text-xs text-growthos-muted truncate">{item.productName} — ₹{item.amount.toLocaleString("en-IN")} · {item.time}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
                  item.status === "APPROVED" ? "bg-green-500/10 text-green-400" :
                  item.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" :
                  "bg-red-500/10 text-red-400"
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-growthos-muted text-sm py-8 text-center">No AI Buyer activity yet</div>
        )}
      </div>
    </div>
  );
}