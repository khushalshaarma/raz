"use client";

import { useEffect, useState, useCallback } from "react";
import { formatConfidencePercent, formatINR } from "@/lib/product/format";

/**
 * Mirrors `ActionRequestOutput` from `src/lib/governance/action.ts`.
 *
 * Fields that this API does not actually provide (requester, requiredRole,
 * requiresFourEyes, expiry, policy name) were previously hard-coded to
 * plausible-looking constants, which made the UI assert governance facts that
 * were never evaluated. They are intentionally absent here rather than faked.
 */
interface ApprovalRequest {
  id: string;
  opportunityType: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  amountMinor: number;
  currency: string;
  status: string;
  reason: string | null;
  createdAt: string;
}

/** Real `ActionRequest.status` values: PENDING | APPROVED | BLOCKED | EXECUTED | EXPIRED. */
type FilterType = "PENDING" | "APPROVED" | "BLOCKED" | "EXPIRED" | "ALL";

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterType>("PENDING");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async (activeFilter: FilterType) => {
    setLoading(true);
    setError("");
    try {
      const params = activeFilter !== "ALL" ? `?status=${activeFilter}&take=20` : "?take=20";
      const res = await fetch(`/api/merchant/governance/actions${params}`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(
          body?.error
            ? `Failed to load approvals: ${body.error}`
            : `Failed to load approvals (HTTP ${res.status})`
        );
        return;
      }

      const data = await res.json();
      const actions: ApprovalRequest[] = (data.actions || []).map((a: Record<string, unknown>) => ({
        id: String(a.id),
        opportunityType: String(a.opportunityType || "UNKNOWN"),
        strategyName: String(a.strategyName || a.strategyId || "Unnamed strategy"),
        recommendedScenario: String(a.recommendedScenario || "-"),
        decisionScore: typeof a.decisionScore === "number" ? a.decisionScore : 0,
        riskLevel: String(a.riskLevel || "LOW"),
        confidence: typeof a.confidence === "number" ? a.confidence : 0,
        amountMinor: typeof a.amountMinor === "number" ? a.amountMinor : 0,
        currency: String(a.currency || "INR"),
        status: String(a.status || "PENDING"),
        reason: typeof a.reason === "string" ? a.reason : null,
        createdAt: String(a.createdAt || ""),
      }));
      setRequests(actions);
    } catch {
      setError("Failed to load approvals: network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  /**
   * Perform a mutation and surface the API's error message.
   *
   * The previous implementation only applied local state when `res.ok` and
   * swallowed every failure, so a 404/403 looked like a dead button: no state
   * change and no message.
   */
  const mutate = useCallback(
    async (id: string, action: "approve" | "reject", reason?: string) => {
      setSubmitting(id);
      setError("");
      try {
        const res = await fetch(`/api/merchant/governance/approvals/${id}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...(action === "reject" ? { body: JSON.stringify({ reason }) } : {}),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(
            body?.error
              ? `${action === "approve" ? "Approval" : "Rejection"} failed: ${body.error}`
              : `${action === "approve" ? "Approval" : "Rejection"} failed (HTTP ${res.status})`
          );
          return;
        }

        await load(filter);
      } catch {
        setError(`${action === "approve" ? "Approval" : "Rejection"} failed: network error`);
      } finally {
        setSubmitting(null);
        setShowRejectInput(null);
      }
    },
    [filter, load]
  );

  const statusColors: Record<string, string> = {
    APPROVED: "bg-green-500/10 text-green-400",
    EXECUTED: "bg-green-500/10 text-green-400",
    BLOCKED: "bg-red-500/10 text-red-400",
    PENDING: "bg-yellow-500/10 text-yellow-400",
    EXPIRED: "bg-gray-500/10 text-gray-400",
  };

  const riskColors: Record<string, string> = {
    LOW: "text-green-400",
    MEDIUM: "text-yellow-400",
    HIGH: "text-red-400",
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: "PENDING", label: "Pending" },
    { key: "APPROVED", label: "Approved" },
    { key: "BLOCKED", label: "Rejected / Blocked" },
    { key: "EXPIRED", label: "Expired" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Approvals</h1>
        <p className="text-growthos-muted text-sm mt-1">Governance approval requests requiring review</p>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-growthos-accent text-white"
                : "bg-growthos-surface border border-growthos-border text-growthos-muted hover:text-growthos-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-growthos-muted">Loading approvals...</div>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-growthos-muted text-sm">
          {error ? "Approval data unavailable." : `No ${filter.toLowerCase()} requests.`}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-growthos-text font-medium">{req.opportunityType}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[req.status] || "bg-gray-500/10 text-gray-400"}`}>
                      {req.status}
                    </span>
                    <span className={`text-sm ${riskColors[req.riskLevel] || "text-gray-400"}`}>{req.riskLevel} Risk</span>
                  </div>
                  <div className="text-sm text-growthos-muted">
                    <span className="font-medium text-growthos-text">Strategy:</span> {req.strategyName}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-growthos-muted">Amount:</span>{" "}
                      <span className="text-growthos-text">{formatINR(req.amountMinor)}</span>
                    </div>
                    <div>
                      <span className="text-growthos-muted">Scenario:</span>{" "}
                      <span className="text-growthos-text">{req.recommendedScenario}</span>
                    </div>
                    <div>
                      <span className="text-growthos-muted">Confidence:</span>{" "}
                      <span className="text-growthos-text">{formatConfidencePercent(req.confidence)}</span>
                    </div>
                    <div>
                      <span className="text-growthos-muted">Decision score:</span>{" "}
                      <span className="text-growthos-text">{req.decisionScore}/100</span>
                    </div>
                    <div className="col-span-2 md:col-span-4">
                      <span className="text-growthos-muted">Created:</span>{" "}
                      <span className="text-growthos-text">
                        {req.createdAt ? new Date(req.createdAt).toLocaleString("en-IN") : "-"}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-growthos-muted">
                    <span className="font-medium">Reason:</span> {req.reason || "Pending governance review"}
                  </div>
                </div>
              </div>
              {req.status === "PENDING" && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-growthos-border/50">
                  <button
                    onClick={() => mutate(req.id, "approve")}
                    disabled={submitting === req.id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting === req.id ? "Working..." : "Approve"}
                  </button>
                  {showRejectInput === req.id ? (
                    <>
                      <input
                        type="text"
                        value={rejectReason[req.id] || ""}
                        onChange={(e) => setRejectReason({ ...rejectReason, [req.id]: e.target.value })}
                        className="flex-1 px-3 py-2 bg-growthos-bg border border-growthos-border rounded-lg text-growthos-text text-sm"
                        placeholder="Rejection reason"
                      />
                      <button
                        onClick={() => mutate(req.id, "reject", rejectReason[req.id] || "Rejected by approver")}
                        disabled={submitting === req.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => setShowRejectInput(null)}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowRejectInput(req.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                    >
                      Reject
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
