"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatConfidencePercent } from "@/lib/product/format";

type OpportunityStat = {
  status: string;
  label: string;
  color: string;
  count: number;
  totalRevenue: number;
  formattedRevenue: string;
};

type OpportunityItem = {
  id: string;
  title: string;
  description: string;
  type: string;
  typeLabel: string;
  estimatedRevenueMinor: number;
  formattedRevenue: string;
  confidence: number;
  status: string;
  statusLabel: string;
  statusColor: string;
  daysOpen: number;
  isExpiringSoon: boolean;
  expiresInDays: number | null;
  relatedActions: { id: string; status: string; strategyName: string | null }[];
  createdAt: string;
};

type OpportunityStats = {
  total: number;
  recentCount: number;
  actionedRevenue30d: number;
  formattedActionedRevenue30d: string;
  byStatus: OpportunityStat[];
};

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "DETECTED", label: "New" },
  { key: "REVIEWING", label: "In Review" },
  { key: "ACTIONED", label: "Actioned" },
  { key: "DISMISSED", label: "Dismissed" },
];

export default function MerchantOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [stats, setStats] = useState<OpportunityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [oppRes, statsRes] = await Promise.all([
        fetch(`/api/merchant/opportunities${activeTab !== "ALL" ? `?status=${activeTab}` : ""}`),
        fetch("/api/merchant/opportunities/stats"),
      ]);
      const oppData = await oppRes.json();
      const statsData = await statsRes.json();
      setOpportunities(oppData.opportunities || []);
      setStats(statsData.stats || null);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleStatusTransition(
    opportunityId: string,
    newStatus: string,
    reason?: string
  ) {
    setTransitioning(opportunityId);
    try {
      await fetch(`/api/merchant/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason }),
      });
      await fetchData();
    } finally {
      setTransitioning(null);
    }
  }

  const statusColorMap: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400",
    yellow: "bg-yellow-500/10 text-yellow-400",
    green: "bg-green-500/10 text-green-400",
    gray: "bg-gray-500/10 text-gray-400",
    red: "bg-red-500/10 text-red-400",
  };

  const typeIcons: Record<string, string> = {
    INACTIVE_CUSTOMERS: "👤",
    CART_ABANDONMENT: "🛒",
    UPSELL: "⬆️",
    CROSS_SELL: "🔄",
    LOW_CONVERSION: "📉",
    PAYMENT_RECOVERY: "💳",
    HIGH_VALUE_CUSTOMER: "⭐",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-growthos-text">
            Opportunity Center
          </h1>
          <p className="text-growthos-muted text-sm mt-1">
            AI-detected revenue opportunities with evidence and recommended actions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Total Opportunities</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">
              {stats.total}
            </div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">Last 30 Days</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">
              {stats.recentCount}
            </div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">
              Revenue Actioned (30d)
            </div>
            <div className="text-2xl font-bold text-green-400 mt-1">
              {stats.formattedActionedRevenue30d}
            </div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-sm text-growthos-muted">By Status</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {stats.byStatus.map((s) => (
                <span
                  key={s.status}
                  className={`px-2 py-0.5 rounded text-xs font-medium ${statusColorMap[s.color] || "bg-gray-500/10 text-gray-400"}`}
                >
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-growthos-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-growthos-accent border-b-2 border-growthos-accent"
                : "text-growthos-muted hover:text-growthos-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Opportunities List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-growthos-muted">Loading opportunities...</div>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🔍</div>
          <div className="text-growthos-muted text-lg">
            No opportunities detected yet
          </div>
          <p className="text-growthos-muted text-sm mt-2">
            Opportunities appear once you have enough customer data
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {opportunities.map((o) => (
            <div
              key={o.id}
              className="p-5 bg-growthos-surface border border-growthos-border rounded-xl hover:border-growthos-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{typeIcons[o.type] || "📊"}</span>
                    <Link
                      href={`/merchant/opportunities/${o.id}`}
                      className="font-semibold text-growthos-text hover:text-growthos-accent transition-colors"
                    >
                      {o.title}
                    </Link>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${statusColorMap[o.statusColor] || "bg-gray-500/10 text-gray-400"}`}
                    >
                      {o.statusLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-growthos-accent/10 text-growthos-accent">
                      {o.typeLabel}
                    </span>
                    {o.isExpiringSoon && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-500/10 text-orange-400">
                        ⚠️ Expires in {o.expiresInDays}d
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-growthos-muted">{o.description}</p>
                  <div className="flex gap-6 text-sm">
                    <span className="text-growthos-muted">
                      Potential:{" "}
                      <span className="text-green-400 font-medium">
                        {o.formattedRevenue}
                      </span>
                    </span>
                    <span className="text-growthos-muted">
                      Confidence:{" "}
                      <span className="text-growthos-text font-medium">
                        {formatConfidencePercent(o.confidence)}
                      </span>
                    </span>
                    <span className="text-growthos-muted">
                      Open:{" "}
                      <span className="text-growthos-text font-medium">
                        {o.daysOpen}d
                      </span>
                    </span>
                    {o.relatedActions.length > 0 && (
                      <span className="text-growthos-muted">
                        Actions:{" "}
                        <span className="text-growthos-text font-medium">
                          {o.relatedActions.length}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 ml-4">
                  {o.status === "DETECTED" && (
                    <>
                      <button
                        disabled={transitioning === o.id}
                        onClick={() =>
                          handleStatusTransition(o.id, "REVIEWING")
                        }
                        className="px-3 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                      >
                        Review
                      </button>
                      <button
                        disabled={transitioning === o.id}
                        onClick={() =>
                          handleStatusTransition(o.id, "DISMISSED")
                        }
                        className="px-3 py-1.5 text-xs font-medium bg-gray-500/10 text-gray-400 rounded-lg hover:bg-gray-500/20 transition-colors disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {o.status === "REVIEWING" && (
                    <>
                      <Link
                        href={`/merchant/opportunities/${o.id}`}
                        className="px-3 py-1.5 text-xs font-medium bg-growthos-accent/10 text-growthos-accent rounded-lg hover:bg-growthos-accent/20 transition-colors"
                      >
                        View Details
                      </Link>
                      <button
                        disabled={transitioning === o.id}
                        onClick={() =>
                          handleStatusTransition(o.id, "DISMISSED")
                        }
                        className="px-3 py-1.5 text-xs font-medium bg-gray-500/10 text-gray-400 rounded-lg hover:bg-gray-500/20 transition-colors disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {o.status === "ACTIONED" && (
                    <Link
                      href={`/merchant/opportunities/${o.id}`}
                      className="px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors"
                    >
                      View Details
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
