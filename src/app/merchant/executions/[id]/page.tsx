"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ExecutionDetail = {
  id: string;
  merchantId: string;
  actionType: string;
  strategyId: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string;
  providerReference: string | null;
  failureCode: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  executionAttempts: {
    id: string;
    attemptNumber: number;
    provider: string;
    status: string;
    providerReference: string | null;
    failureCode: string | null;
    failureReason: string | null;
    createdAt: string;
  }[];
  reconciliation: {
    id: string;
    status: string;
    reconciledAt: string | null;
  } | null;
  governanceDecision: {
    id: string;
    decision: string;
    decisionReason: string;
  } | null;
};

const STATUS_COLORS: Record<string, string> = {
  CREATED: "bg-gray-500/10 text-gray-400",
  PREFLIGHT: "bg-blue-500/10 text-blue-400",
  SUBMITTED: "bg-yellow-500/10 text-yellow-400",
  EXECUTING: "bg-yellow-500/10 text-yellow-400",
  SUCCEEDED: "bg-green-500/10 text-green-400",
  FAILED: "bg-red-500/10 text-red-400",
  RETRYING: "bg-orange-500/10 text-orange-400",
  CANCELLED: "bg-gray-500/10 text-gray-400",
  BLOCKED: "bg-red-500/10 text-red-400",
};

const TIMELINE_STATUS_COLORS: Record<string, string> = {
  CREATED: "bg-gray-400",
  PREFLIGHT: "bg-blue-400",
  SUBMITTED: "bg-yellow-400",
  EXECUTING: "bg-yellow-400",
  SUCCEEDED: "bg-green-400",
  FAILED: "bg-red-400",
  RETRYING: "bg-orange-400",
  PENDING: "bg-yellow-400",
};

export default function ExecutionDetailPage() {
  const { id } = useParams();
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/merchant/executions?id=${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExecution(data.execution);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-growthos-muted">Loading execution...</div>
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/merchant/executions" className="text-sm text-growthos-muted hover:text-growthos-accent">
          ← Back to executions
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error || "Execution not found"}
        </div>
      </div>
    );
  }

  const attempts = execution.executionAttempts || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/merchant/executions" className="text-sm text-growthos-muted hover:text-growthos-accent">
        ← Back to executions
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-growthos-text">
            Execution {execution.id.slice(0, 8)}...
          </h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[execution.status] || STATUS_COLORS.CREATED}`}>
            {execution.status}
          </span>
        </div>
        <p className="text-sm text-growthos-muted mt-1">
          Created {new Date(execution.createdAt).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Amount</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">
            ₹{((execution.amountMinor) / 100).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Action Type</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">
            {execution.actionType}
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Attempts</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{attempts.length}</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Provider</div>
          <div className="text-2xl font-bold text-growthos-text mt-1">{execution.provider}</div>
        </div>
      </div>

      {/* Provider Reference */}
      {execution.providerReference && (
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-sm text-growthos-muted">Provider Reference</div>
          <div className="text-sm text-growthos-text font-mono mt-1">{execution.providerReference}</div>
        </div>
      )}

      {/* Failure Info */}
      {execution.failureCode && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="text-sm text-red-400 font-medium">Failure: {execution.failureCode}</div>
          {execution.failureReason && (
            <div className="text-sm text-red-400/70 mt-1">{execution.failureReason}</div>
          )}
        </div>
      )}

      {/* Governance Decision */}
      {execution.governanceDecision && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-2">Governance Decision</h3>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              execution.governanceDecision.decision === "APPROVED"
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {execution.governanceDecision.decision}
            </span>
            <span className="text-sm text-growthos-muted">
              {execution.governanceDecision.decisionReason}
            </span>
          </div>
        </div>
      )}

      {/* Attempts Timeline */}
      {attempts.length > 0 && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-3">Attempts</h3>
          <div className="space-y-3">
            {attempts.map((att) => (
              <div key={att.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${TIMELINE_STATUS_COLORS[att.status] || "bg-gray-400"} mt-1`} />
                  <div className="w-px flex-1 bg-growthos-border mt-1" />
                </div>
                <div className="pb-4 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-growthos-text">
                      Attempt #{att.attemptNumber}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[att.status] || "bg-gray-500/10 text-gray-400"}`}>
                      {att.status}
                    </span>
                    <span className="text-xs text-growthos-muted">{att.provider}</span>
                  </div>
                  {att.providerReference && (
                    <div className="text-xs text-growthos-muted font-mono mt-1">
                      Ref: {att.providerReference}
                    </div>
                  )}
                  {att.failureCode && (
                    <div className="text-xs text-red-400 mt-1">
                      {att.failureCode}: {att.failureReason || "No details"}
                    </div>
                  )}
                  <div className="text-xs text-growthos-muted mt-1">
                    {new Date(att.createdAt).toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reconciliation */}
      {execution.reconciliation && (
        <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
          <h3 className="font-medium text-growthos-text mb-2">Reconciliation</h3>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              execution.reconciliation.status === "RECONCILED"
                ? "bg-green-500/10 text-green-400"
                : "bg-yellow-500/10 text-yellow-400"
            }`}>
              {execution.reconciliation.status}
            </span>
            {execution.reconciliation.reconciledAt && (
              <span className="text-sm text-growthos-muted">
                {new Date(execution.reconciliation.reconciledAt).toLocaleString("en-IN")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="p-5 bg-growthos-surface border border-growthos-border rounded-xl">
        <h3 className="font-medium text-growthos-text mb-3">Timeline</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-growthos-muted">Created: </span>
            <span className="text-growthos-text">
              {new Date(execution.createdAt).toLocaleString("en-IN")}
            </span>
          </div>
          {execution.startedAt && (
            <div>
              <span className="text-growthos-muted">Started: </span>
              <span className="text-growthos-text">
                {new Date(execution.startedAt).toLocaleString("en-IN")}
              </span>
            </div>
          )}
          {execution.completedAt && (
            <div>
              <span className="text-growthos-muted">Completed: </span>
              <span className="text-growthos-text">
                {new Date(execution.completedAt).toLocaleString("en-IN")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
