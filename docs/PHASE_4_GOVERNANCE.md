# Phase 4 Governance Orchestrator

## Purpose

The Governance Orchestrator (`governance.ts`) is the main entry point for Phase 4 evaluation. It runs a **19-step deterministic pipeline** that evaluates every proposed action through all security, policy, and gate checks before producing a final decision. It is fail-closed and follows a default-deny philosophy.

## Input: CreateActionRequestInput

See `action.ts` — the same interface used by the orchestrator:

```typescript
interface CreateActionRequestInput {
  actionType: ActionTypeFull;
  strategyId: string;
  recommendedScenario?: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
  decisionScore?: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  confidence?: number;
  amountMinor: number;
  currency: string;
  rationale?: string;
  evidence?: string;
  policyId?: string;
  customerCount?: number;
  orderCount?: number;
  historicalSpanDays?: number;
  customerId?: string;
}
```

Plus an `authenticatedMerchantId: string` parameter for merchant isolation.

## Output: GovernanceEvaluationResult

See `governance.ts` — comprehensive result including all gate results, reason codes, explanation, and timestamp.

## All 19 Steps

### Step 1: Validate Request
- Call `createActionRequest(input, authenticatedMerchantId)` to create an `ActionRequest` record in the database
- If `actionResult.status === "BLOCKED"` (invalid action type), push `actionResult.reason` to `allReasonCodes`
- If action creation throws, call `failClosed("ACTION_CREATION_FAILED", ...)`

### Step 2: Check Automation State (Kill Switch)
- Check for global emergency stop via `prisma.systemHealth.findFirst({ where: { application: "ok" } })`
- Check for merchant automation pause via `prisma.policy.findFirst({ where: { merchantId, name: "AUTOMATION_PAUSED", isActive: true } })`
- If `pausedAutomation` exists, push `AUTOMATION_PAUSED` to `allReasonCodes`
- If this check throws, call `failClosed("AUTOMATION_STATE_CHECK_FAILED", ...)`
- **Note**: The emergency stop check reads `application: "ok"` but does NOT check the `api` field for STOPPED status (emergency stop is handled separately)

### Steps 3-6: Validate Merchant, Decision, Strategy, Target
- These are validated implicitly through `createActionRequest()` and Prisma constraints
- If validation fails, the action request is created with `status: "BLOCKED"`

### Step 7: Data Quality Gate
- Call `evaluateDataQualityGate()` with `customerCount`, `orderCount`, `historicalSpanDays`, `policyId`
- If decision is `BLOCK`, push `DATA_QUALITY_BLOCK`
- If decision is `REQUIRE_APPROVAL`, push `DATA_QUALITY_REQUIRES_APPROVAL`

### Step 8: Confidence Gate
- Call `evaluateConfidenceGate()` with `confidenceScore`, `policyId`
- If decision is `BLOCK`, push `CONFIDENCE_BLOCK`
- If decision is `REQUIRE_APPROVAL`, push `CONFIDENCE_REQUIRES_APPROVAL`

### Step 9: Risk Gate
- Call `evaluateRiskGate()` with risk score derived from `riskLevel`: HIGH→80, MEDIUM→50, LOW→20
- If decision is `BLOCK`, push `RISK_BLOCK`
- If decision is `REQUIRE_APPROVAL`, push `RISK_REQUIRES_APPROVAL`

### Step 10: Security Agent
- Call `evaluateSecurity()` with `merchantId`, `actionRequestId`, `amountMinor`, `actionType`, `customerId`, `targetStrategyId`
- If `securityLevel === "BLOCKED"`, push `SECURITY_BLOCK`
- If `securityLevel === "SUSPICIOUS"`, push `SECURITY_SUSPICIOUS`

### Step 11: Policy Engine
- Call `evaluatePolicy()` with `policyId || "default-policy"` and context (riskScore, confidenceScore, dataQualityScore, velocity=0, spendMinor)
- If decision is `BLOCK`, push `POLICY_BLOCK`
- If decision is `REQUIRE_APPROVAL`, push `POLICY_REQUIRES_APPROVAL`

### Step 12: Velocity Gate
- Call `evaluateVelocityGate()` with `currentCount: 0` (placeholder), `period: "day"`, `policyId`, `merchantId`
- If decision is `BLOCK`, push `VELOCITY_BLOCK`
- If decision is `REQUIRE_APPROVAL`, push `VELOCITY_REQUIRES_APPROVAL`

### Step 13: Spend Gate
- Call `evaluateSpendGate()` with `amountMinor`, `currency: "INR"`, `policyId`, `merchantId`
- If decision is `BLOCK`, push `SPEND_BLOCK`
- If decision is `REQUIRE_APPROVAL`, push `SPEND_REQUIRES_APPROVAL`

### Step 14: Customer Protection
- Call `evaluateCustomerProtection()` with `merchantId`, `customerId`, `strategyId`, `actionType`, `now`
- If decision is `BLOCK`, push `CUSTOMER_PROTECTION_BLOCK`

### Step 15: Approval Engine
- Call `evaluateApproval()` with riskScore, confidenceScore, amountMinor, actionType, customerCount, securityResult, policyId
- No reason codes pushed from approval result directly

### Step 16: Final Governance Decision
- **Precedence**: BLOCKED > REQUIRE_APPROVAL > APPROVED > EXECUTION_READY
- If `AUTOMATION_PAUSED` or `GLOBAL_EMERGENCY_STOP` → BLOCKED
- If any critical block reason code exists → BLOCKED
- If any require-approval reason code exists → REQUIRE_APPROVAL
- If `approvalResult.decision === "NO_APPROVAL_REQUIRED"` → APPROVED
- Otherwise → BLOCKED (default fallback)

### Step 17: Persist GovernanceDecision
- Create `GovernanceDecision` record with: `merchantId`, `actionRequestId`, `decision`, `decisionReason`, `riskLevel`, `confidence`, `status`, `evidence` (JSON string of all gate results)
- Status: `BLOCKED` if blocked, `PENDING` otherwise
- **Note**: `EXECUTION_READY` status is never used (it would map to `PENDING`)

### Step 18: Persist AuditLog
- Create `AuditLog` record with: `merchantId`, `action: GOVERNANCE_{finalDecision}`, `resourceType: GOVERNANCE_DECISION`, `resourceId`, `outcome`, `details` (JSON of reason codes), `severity` (CRITICAL if BLOCKED, INFO otherwise)
- If persistence fails, push `PERSISTENCE_ERROR` to `allReasonCodes` (but still return result)

### Step 19: Build Final Result
- Construct `GovernanceEvaluationResult` with all gate results, reason codes, explanation, and timestamp

## Fail-Closed Behavior

The `failClosed()` function returns a result where **every gate decision is BLOCK**:

```typescript
function failClosed(reasonCode: string, allReasonCodes: string[], evaluatedAt: Date): GovernanceEvaluationResult {
  // All gates return BLOCK
  // securityScore: 0, securityLevel: "BLOCKED"
  // riskScore: 100, riskLevel: "HIGH"
  // governanceDecision: "BLOCKED"
  // explanation: "Governance BLOCKED due to {reasonCode}. Fail-closed: critical service unavailable."
}
```

Triggers for fail-closed:
- `ACTION_CREATION_FAILED` — Step 1 throws
- `AUTOMATION_STATE_CHECK_FAILED` — Step 2 throws

**Note**: Customer protection database errors return `BLOCK` but do NOT trigger `failClosed` (they return a result normally). Kill switch errors allow by default (do NOT fail-closed).

## Default Deny

- If no policy is found → `POLICY_NOT_FOUND` → `BLOCK`
- If data quality is insufficient → `BLOCK` (unless policy overrides)
- If any block reason code is present → final decision is `BLOCKED`
- If `AUTOMATION_PAUSED` → `BLOCKED`
- Fallback: unknown state → `BLOCKED`
- The only path to `APPROVED` is `approvalResult.decision === "NO_APPROVAL_REQUIRED"` with no blocks or approval requirements

## Idempotency

The `idempotency.ts` module provides database-backed idempotency:

- `createIdempotencyRecord(idempotencyKey, merchantId, decisionId, actionRequestId)`:
  - Checks if a `GovernanceDecision` exists with matching `merchantId`, `actionRequestId`, `id: decisionId`
  - If found → returns `{ isNew: false, governanceDecisionId, wasRetrieved: true }`
  - Checks for idempotency key record with matching `merchantId`, `actionRequestId`
  - If found and `status !== "PENDING"` → returns existing result
  - Otherwise → returns `{ isNew: true }`
- `isDuplicateRequest(idempotencyKey, merchantId, decisionId)`: Returns `true` if a `GovernanceDecision` exists with matching `merchantId` and `id: decisionId`
- **Note**: The idempotency module is defined but NOT called from the orchestrator (`governance.ts` does not import or use it)

## Security Considerations

- **No eval(), no arbitrary code execution**: All checks are deterministic numeric comparisons
- **No LLM**: The entire pipeline is deterministic. No AI/LLM calls are made.
- **Fail-closed**: Any critical service failure defaults to BLOCK
- **Merchant isolation**: `authenticatedMerchantId` scopes all operations
- **Immutable audit trail**: Every decision creates an `AuditLog` record
- **Evidence serialization**: All gate results are serialized to JSON in the `evidence` field of `GovernanceDecision`
- **No persistence = no decision**: If database persistence fails, `PERSISTENCE_ERROR` is added but the result is still returned
- **Server-side only**: All evaluation happens server-side

## Tests

**No dedicated tests exist for the Governance Orchestrator.** The 53 project-wide tests do not cover governance behavior. There are no unit tests for `evaluateGovernance()`, `failClosed()`, or any orchestrator function.
