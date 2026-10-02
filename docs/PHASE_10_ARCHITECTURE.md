# GrowthOS Phase 10 — Architecture

## Overview
Phase 10 closes the remaining integration gaps to make GrowthOS internally consistent across the full intelligence → decision → governance → approval → execution → outcome → learning pipeline.

## Changes Implemented

### 1. Transaction Safety (GAP 5)
Every multi-step DB operation that represents one logical unit of work is now atomic.

| Operation | File | Mutations |
|-----------|------|-----------|
| Simulation run | `simulation-center.ts` | Simulation + Scenarios + Decision |
| Governance evaluation | `governance.ts` | GovernanceDecision + AuditLog |
| Approval | `approve/route.ts` | GovernanceDecision + ActionRequest + AuditLog |
| Rejection | `reject/route.ts` | GovernanceDecision + ActionRequest + AuditLog |
| Webhook payment | `razorpay/route.ts` | Execution + GovernanceDecision + ActionRequest + AuditLog |

Pattern: `prisma.$transaction(async (tx) => { ... })`
On failure: full rollback, no partial state.

### 2. Governance Snapshot
Every `GovernanceDecision` now includes a `GovernanceSnapshot` in its evidence JSON:
```json
{
  "snapshot": {
    "evaluatedAt": "2026-09-09T...",
    "riskAnalysis": { "riskScore": 78, "riskLevel": "HIGH", "source": "INPUT_SCORE" },
    "confidenceAnalysis": { "confidenceScore": 65, "confidenceLevel": "MEDIUM", "source": "INPUT" },
    "dataQuality": { "dataQualityScore": 58, "insufficient": false, "customerCount": 50, "orderCount": 100, "historicalSpanDays": 180 },
    "policyVersion": 1,
    "policyId": "...",
    "actionType": "DISCOUNT",
    "strategyId": "...",
    "amountMinor": 50000,
    "currency": "INR"
  }
}
```
Historical decisions remain explainable even if policies, strategies, or scores change.

### 3. Risk + Confidence Integration
The governance risk gate now accepts actual risk scores from the intelligence engine:
- If `riskScore` is provided in input, it's used directly (source: `INPUT_SCORE`)
- Otherwise, falls back to label-based scoring (source: `INPUT_LABEL`)

Same for confidence:
- If `confidenceScore` is provided, it's used directly
- Otherwise, uses raw input value

### 4. Policy Versioning
The governance snapshot captures `policyId` and `policyVersion` at evaluation time. This ensures audit records reference the exact policy configuration that governed an action.

### 5. Approval Concurrency Safety
Approve/reject operations use `updateMany` with status guard:
```typescript
await tx.governanceDecision.updateMany({
  where: { id: params.id, status: "PENDING" },
  data: { status: "APPROVED", ... },
});
if (updated.count === 0) {
  throw new Error("Decision was already processed (race condition detected)");
}
```
This prevents double-approval from concurrent requests.

### 6. Webhook Atomicity
Payment webhook processing now atomically updates:
1. Execution status
2. GovernanceDecision.executedAt (on success)
3. ActionRequest.status (on success/failure)
4. AuditLog entry

No stale governance state after webhook receipt.

## Security Posture
- All monetary values: integer paise (no floating-point)
- Fail-closed: governance throws on persistence failure
- Kill switch: defaults to PAUSED on error
- Emergency stop: defaults to ENABLED on error
- Merchant isolation: enforced in every query
- No LLM for financial/risk/confidence calculations
