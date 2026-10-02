"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toConfidencePercent } from "@/lib/product/format";

type OpportunityDetail = {
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
  evidence: string;
  actionCount: number;
  lastActivity: string | null;
  timeline: { timestamp: string; event: string; detail: string }[];
  relatedActions: { id: string; status: string; strategyName: string | null }[];
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  green: "bg-green-500/10 text-green-400 border-green-500/20",
  gray: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  red: "bg-red-500/10 text-red-400 border-red-500/20",
};

const TYPE_ICONS: Record<string, string> = {
  INACTIVE_CUSTOMERS: "👤",
  CART_ABANDONMENT: "🛒",
  UPSELL: "⬆️",
  CROSS_SELL: "🔄",
  LOW_CONVERSION: "📉",
  PAYMENT_RECOVERY: "💳",
  HIGH_VALUE_CUSTOMER: "⭐",
};

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [dismissReason, setDismissReason] = useState("");
  const [showDismiss, setShowDismiss] = useState(false);

  const fetchOpportunity = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/merchant/opportunities/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOpportunity(data.opportunity);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOpportunity();
  }, [fetchOpportunity]);

  async function handleTransition(newStatus: string, reason?: string) {
    setTransitioning(true);
    try {
      const res = await fetch(`/api/merchant/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchOpportunity();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transition failed");
    } finally {
      setTransitioning(false);
      setShowDismiss(false);
      setDismissReason("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-growthos-muted">Loading opportunity...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link
          href="/merchant/opportunities"
          className="text-sm text-growthos-muted hover:text-growthos-accent"
        >
          ← Back to opportunities
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="text-center py-12">
        <div className="text-growthos-muted">Opportunity not found.</div>
        <Link
          href="/merchant/opportunities"
          className="text-growthos-accent hover:underline text-sm"
        >
          Back to opportunities
        </Link>
      </div>
    );
  }

  const confidencePct = toConfidencePercent(opportunity.confidence);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Link */}
      <Link
        href="/merchant/opportunities"
        className="text-sm text-growthos-muted hover:text-growthos-accent"
      >
        ← Back to opportunities
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{TYPE_ICONS[opportunity.type] || "📊"}</span>
            <div>
              <h1 className="text-2xl font-bold text-growthos-text">
                {opportunity.title}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[opportunity.statusColor] || STATUS_COLORS.gray}`}
                >
                  {opportunity.statusLabel}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-growthos-accent/10 text-growthos-accent">
                  {opportunity.typeLabel}
                </span>
                <span className="text-xs text-growthos-muted">
                  Open {opportunity.daysOpen}d
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {opportunity.status === "DETECTED" && (
            <>
              <button
                disabled={transitioning}
                onClick={() => handleTransition("REVIEWING")}
                className="px-4 py-2 text-sm font-medium bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                {transitioning ? "Updating..." : "Start Review"}
              </button>
              <button
                disabled={transitioning}
                onClick={() => setShowDismiss(true)}
                className="px-4 py-2 text-sm font-medium bg-gray-500/10 text-gray-400 rounded-lg hover:bg-gray-500/20 transition-colors disabled:opacity-50"
              >
                Dismiss
              </button>
            </>
          )}
          {opportunity.status === "REVIEWING" && (
            <>
              <button
                disabled={transitioning}
                onClick={() => handleTransition("ACTIONED")}
                className="px-4 py-2 text-sm font-medium bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                {transitioning ? "Updating..." : "Mark Actioned"}
              </button>
              <button
                disabled={transitioning}
                onClick={() => setShowDismiss(true)}
                className="px-4 py-2 text-sm font-medium bg-gray-500/10 text-gray-400 rounded-lg hover:bg-gray-500/20 transition-colors disabled:opacity-50"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dismiss Modal */}
      {showDismiss && (
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl space-y-3">
          <h3 className="font-medium text-growthos-text">Dismiss Opportunity</h3>
          <textarea
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            placeholder="Optional reason for dismissal..."
            className="w-full p-3 bg-growthos-bg border border-growthos-border rounded-lg text-sm text-growthos-text placeholder:text-growthos-muted resize-none"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleTransition("DISMISSED", dismissReason || undefined)}
              disabled={transitioning}
              className="px-4 py-2 text-sm font-medium bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Confirm Dismiss
            </button>
            <button
              onClick={() => {
                setShowDismiss(false);
                setDismissReason("");
              }}
              className="px-4 py-2 text-sm font-medium text-growthos-muted hover:text-growthos-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Potential Revenue</div>
          <div className="text-2xl font-bold text-green-400 mt-1">
            {opportunity.formattedRevenue}
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Confidence</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-growthos-text">
              {confidencePct}%
            </span>
            <div className="flex-1 h-2 bg-growthos-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  confidencePct >= 80
                    ? "bg-green-400"
                    : confidencePct >= 50
                      ? "bg-yellow-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${confidencePct}%` }}
              />
            </div>
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Days Open</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">
            {opportunity.daysOpen}
          </div>
          {opportunity.isExpiringSoon && (
            <div className="text-xs text-orange-400 mt-1">
              ⚠️ Expires in {opportunity.expiresInDays}d
            </div>
          )}
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Related Actions</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">
            {opportunity.actionCount}
          </div>
        </div>
      </div>

      {/* Description & Evidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-2">Why Detected</h3>
          <p className="text-sm text-growthos-muted">{opportunity.description}</p>
        </div>
        {opportunity.evidence && (
          <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
            <h3 className="font-medium text-growthos-text mb-2">Evidence</h3>
            <p className="text-sm text-growthos-muted">{opportunity.evidence}</p>
          </div>
        )}
      </div>

      {/* Related Actions */}
      {opportunity.relatedActions.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Related Actions</h3>
          <div className="space-y-2">
            {opportunity.relatedActions.map((action) => (
              <Link
                key={action.id}
                href={`/merchant/governance/actions/${action.id}`}
                className="flex items-center justify-between p-3 bg-growthos-bg border border-growthos-border rounded-lg hover:border-growthos-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-growthos-text">
                    {action.strategyName || "Action"}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      action.status === "APPROVED"
                        ? "bg-green-500/10 text-green-400"
                        : action.status === "PENDING"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : action.status === "BLOCKED"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-gray-500/10 text-gray-400"
                    }`}
                  >
                    {action.status}
                  </span>
                </div>
                <span className="text-xs text-growthos-muted">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {opportunity.timeline.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Timeline</h3>
          <div className="space-y-3">
            {opportunity.timeline.map((event, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-growthos-accent mt-2" />
                  {i < opportunity.timeline.length - 1 && (
                    <div className="w-px flex-1 bg-growthos-border mt-1" />
                  )}
                </div>
                <div className="pb-4">
                  <div className="text-sm font-medium text-growthos-text">
                    {event.event}
                  </div>
                  <div className="text-xs text-growthos-muted mt-0.5">
                    {new Date(event.timestamp).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-sm text-growthos-muted mt-1">
                    {event.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
