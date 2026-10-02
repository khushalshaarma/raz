# GrowthOS Phase 10 — Gap Analysis

## Transaction Candidates (GAP 5)

| # | Location | Mutations | Risk | Priority |
|---|----------|-----------|------|----------|
| 1 | `simulation-center.ts:runSimulation()` | Simulation + Scenarios + Decision | Partial state on failure | HIGH |
| 2 | `governance/governance.ts` | ActionRequest + GovernanceDecision + AuditLog | Governance decision without audit | HIGH |
| 3 | `approvals/[id]/approve/route.ts` | GovernanceDecision.update + AuditLog.create | Approved UI but DB pending | HIGH |
| 4 | `approvals/[id]/reject/route.ts` | GovernanceDecision.update + AuditLog.create | Rejected UI but DB pending | HIGH |
| 5 | `razorpay/route.ts:processPaymentEvent()` | Execution + GovernanceDecision + ActionRequest | Stale governance after payment | HIGH |
| 6 | `executor.ts:executeProviderAction()` | Execution + ExecutionAttempt + AuditLog | Attempt without status update | MEDIUM |
| 7 | `orchestrator.ts:runGrowthCycle()` | GrowthCycle + AgentRun + AgentEvent | Cycle state inconsistent | MEDIUM |
| 8 | `reconciliation.ts` | Reconciliation + Execution update | Reconciliation without execution fix | MEDIUM |

## Governance Integration (GAP 8)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Risk gate receives hardcoded scores | `governance.ts:275-279` | Run `runRiskAnalysis()` with real inputs |
| 2 | Confidence gate receives raw input | `governance.ts:265-269` | Run `runConfidenceAnalysis()` with real data |
| 3 | No governance snapshot | `governance.ts:450-480` | Add `GovernanceSnapshot` to evidence |
| 4 | Policy version not captured | `governance.ts` | Store policy version in snapshot |

## Approval Atomicity

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Approve is non-atomic | `approve/route.ts:45-65` | Wrap in `$transaction` |
| 2 | Reject is non-atomic | `reject/route.ts:38-55` | Wrap in `$transaction` |

## Execution Safety

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Executor relies on preflight for governance check | `preflight.ts` | Already checks governance status — OK |
| 2 | Webhook doesn't check idempotency | `razorpay/route.ts:37-77` | Already handled by `processWebhookEvent` — OK |

## Concurrency

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Approval race condition | `approve/route.ts` | Use `updateMany` with status check |
| 2 | Execution unique constraint exists | Schema `@@unique([merchantId, idempotencyKey])` | Already prevents duplicate — OK |

## Agent Safety

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | Agents go through governance | `orchestrator.ts:190-210` | OK — governance checked |
| 2 | Execution agent receives governance result | `orchestrator.ts:213-225` | OK — BLOCKED stops cycle |

## Audit Completeness

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Audit functions scattered | `audit.ts`, `result.ts`, `governance.ts` | Use consistent `createAuditEvent` |
| 2 | Some transitions not audited | Various | Add audit events for key transitions |
