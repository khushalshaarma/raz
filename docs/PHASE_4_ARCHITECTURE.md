# GrowthOS Phase 4 Architecture — Governance

## Overview

Phase 4 implements the **Governance** layer that sits between Phase 3 (Decision Intelligence) and execution. It evaluates every proposed action through a deterministic, fail-closed pipeline of 19 steps before any action can be executed. No LLM is involved. All checks are deterministic and server-side.

## Pipeline: Phase 1 → Phase 2 → Phase 3 → Phase 4 → EXECUTION_READY → STOP

```
Phase 1 (Foundation)
  → User, Merchant, Customer, Product, Order, Payment, Campaign, Opportunity, Agent, AuditEvent, SystemHealth models
  → JWT authentication, role-based authorization, merchant data isolation
  ↓
Phase 2 (Intelligence)
  → Opportunity Agent, Strategy Agent, Simulation Agent
  → Scenario Engine, Risk Engine, Confidence Engine
  ↓
Phase 3 (Simulation + Decision)
  → Scenario Engine → Simulation Agent → Decision Engine → Recommendation Score → Explainable Decision
  → Produces SIMULATED DECISIONS, not EXECUTED ACTIONS
  ↓
Phase 4 (Governance) ← THIS DOCUMENT
  → 19-step deterministic evaluation pipeline
  → Action request created → All gates evaluated → Final decision
  ↓
EXECUTION_READY
  → Only reached when all gates pass and no approval is required
  → GovernanceDecision status = APPROVED, then execution can proceed
  ↓
STOP
  → Any gate failure, security block, or emergency stop terminates the pipeline
```

**Phase 5 is NOT implemented.** There is no autonomous execution, no Razorpay integration for action execution, no payment API calls, no campaign sending, and no external side effects. Phase 4 only evaluates — it never executes.

## Phase 4 Flow

```
CreateActionRequestInput
       ↓
Step 1:  validate request → createActionRequest()
       ↓
Step 2:  check automation state (kill switch) → checkEmergencyStop()
       ↓
Steps 3-6: validate merchant, decision, strategy, target (via Prisma constraints)
       ↓
Step 7:  Data Quality Gate → evaluateDataQualityGate()
       ↓
Step 8:  Confidence Gate → evaluateConfidenceGate()
       ↓
Step 9:  Risk Gate → evaluateRiskGate()
       ↓
Step 10: Security Agent → evaluateSecurity()
       ↓
Step 11: Policy Engine → evaluatePolicy()
       ↓
Step 12: Velocity Gate → evaluateVelocityGate()
       ↓
Step 13: Spend Gate → evaluateSpendGate()
       ↓
Step 14: Customer Protection → evaluateCustomerProtection()
       ↓
Step 15: Approval Engine → evaluateApproval()
       ↓
Step 16: Final Governance Decision (precedence: BLOCKED > REQUIRE_APPROVAL > APPROVED > EXECUTION_READY)
       ↓
Step 17: Persist GovernanceDecision
       ↓
Step 18: Persist AuditLog
       ↓
Step 19: Return GovernanceEvaluationResult
```

## Fail-Closed Behavior

If **ANY** critical service fails during evaluation, the entire governance pipeline returns `BLOCKED` with reason code describing the failure. This is implemented by `failClosed()` in `governance.ts`:

- All gate decisions become `BLOCK`
- Security score becomes 0, level `BLOCKED`
- Risk score becomes 100, level `HIGH`
- Policy engine decision becomes `BLOCK`
- Approval engine decision becomes `BLOCKED`
- Explanation states: `Governance BLOCKED due to {reasonCode}. Fail-closed: critical service unavailable.`

This applies to:
- Action creation failure (`ACTION_CREATION_FAILED`)
- Automation state check failure (`AUTOMATION_STATE_CHECK_FAILED`)
- Customer protection database error (`DATABASE_UNAVAILABLE` → BLOCK)
- Kill switch error: **does NOT fail-closed** — allows by default (less restrictive)

## Default Deny

- If no policy is found or policy is inactive → `POLICY_NOT_FOUND` → `BLOCK`
- If policy evaluation returns no rules → defaults to `ALLOW` (only when matchedRules.length === 0)
- If data quality is insufficient → `BLOCK` (unless policy overrides)
- If any critical reason code is present (`SECURITY_BLOCK`, `POLICY_BLOCK`, `SPEND_BLOCK`, `VELOCITY_BLOCK`, `CUSTOMER_PROTECTION_BLOCK`, `DATA_QUALITY_BLOCK`, `CONFIDENCE_BLOCK`, `RISK_BLOCK`) → final decision is `BLOCKED`
- If `AUTOMATION_PAUSED` or `GLOBAL_EMERGENCY_STOP` is active → `BLOCKED`

## All Phase 4 Components

| # | Module | File | Purpose |
|---|--------|------|---------|
| 1 | Action | `action.ts` | Create, list, get action requests; validate merchant isolation |
| 2 | Policy Engine | `policy-engine.ts` | Evaluate policies with GTE/LTE/EQ/NEQ/GT/LT operators |
| 3 | Risk Gate | `risk-gate.ts` | Evaluate risk score against thresholds |
| 4 | Confidence Gate | `confidence-gate.ts` | Evaluate confidence score against thresholds |
| 5 | Data Quality Gate | `data-quality-gate.ts` | Evaluate data sufficiency |
| 6 | Velocity Gate | `velocity-gate.ts` | Evaluate action frequency against limits |
| 7 | Spend Gate | `spend-gate.ts` | Evaluate monetary limits (action, daily, monthly, per-customer) |
| 8 | Security Agent | `security-agent.ts` | Deterministic security validation (0-100 score, SECURE/SUSPICIOUS/BLOCKED) |
| 9 | Approval Engine | `approval-engine.ts` | Determine approval requirements (four-eyes principle) |
| 10 | Governance Orchestrator | `governance.ts` | Main 19-step pipeline, fail-closed, final decision |
| 11 | Kill Switch | `kill-switch.ts` | Merchant automation pause/resume control |
| 12 | Emergency Stop | `emergency-stop.ts` | Global emergency stop via SystemHealth table |
| 13 | Idempotency | `idempotency.ts` | Database-backed deduplication of governance decisions |
| 14 | Customer Protection | `customer-protection.ts` | Cooldown, max per day/month, duplicate action prevention |

## Input: CreateActionRequestInput

```typescript
interface CreateActionRequestInput {
  actionType: ActionTypeFull;           // DISCOUNT | CASHBACK | COUPON | BUNDLE | UPSELL | CROSS_SELL | REACTIVATION | CAMPAIGN | REFUND | PAYMENT_RECOVERY | INVALID
  strategyId: string;
  recommendedScenario?: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
  decisionScore?: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  confidence?: number;
  amountMinor: number;                  // Non-negative integer in paise
  currency: string;                     // Only "INR" supported
  rationale?: string;
  evidence?: string;
  policyId?: string;
  customerCount?: number;
  orderCount?: number;
  historicalSpanDays?: number;
  customerId?: string;
}
```

## Output: GovernanceEvaluationResult

```typescript
interface GovernanceEvaluationResult {
  governanceDecision: "BLOCKED" | "REQUIRE_APPROVAL" | "APPROVED" | "EXECUTION_READY";
  actionRequestId: string;
  merchantId: string;
  dataQualityGate: { decision, dataQualityScore, insufficient, reasonCode };
  confidenceGate: { decision, confidenceScore, confidenceLevel, reasonCode };
  riskGate: { decision, riskScore, riskLevel, reasonCode };
  security: { securityScore, securityLevel, reasonCodes };
  policyEngine: { decision, matchedRules, violations, reasonCodes, policyId };
  velocity: { decision, currentCount, limit, reasonCode };
  spend: { decision, currentAmountMinor, limitMinor, reasonCode };
  customerProtection: { decision, reasonCode };
  approvalEngine: { decision, requiresFourEyes, requiredRole, reasonCode };
  allReasonCodes: string[];
  explanation: string;
  evaluatedAt: Date;
}
```

## Decision Logic

### Final Decision Precedence

1. **BLOCKED** — If any component returns BLOCK, or if `AUTOMATION_PAUSED` or `GLOBAL_EMERGENCY_STOP` is active. Nothing can override a BLOCKED decision.
2. **REQUIRE_APPROVAL** — If any component returns REQUIRE_APPROVAL, or if approval engine returns MERCHANT/ADMIN/DUAL_APPROVAL_REQUIRED.
3. **APPROVED** — If approval engine returns `NO_APPROVAL_REQUIRED` and no blocks or approval requirements exist.
4. **EXECUTION_READY** — Not currently produced by the code (the `finalDecision` variable never evaluates to this string; it defaults to `BLOCKED` as fallback).

### Risk Gate Decision Logic

```
riskScore >= 70  → BLOCK (HIGH)
riskScore >= 40  → REQUIRE_APPROVAL (MEDIUM)
riskScore < 40   → PASS (LOW)
```

Default thresholds: low=40, high=70. Policy can override thresholds via `conditionOperator` and `conditionValue` on the Policy record.

### Confidence Gate Decision Logic

```
confidenceScore >= 70  → PASS (HIGH)
confidenceScore >= 60  → REQUIRE_APPROVAL (MEDIUM)
confidenceScore < 60   → BLOCK (LOW)
```

Default thresholds: pass=70, approved=60. Policy can override via condition fields.

### Policy Engine Decision Logic

- **Operators**: GTE (>=), LTE (<=), EQ (==), NEQ (!=), GT (>), LT (<)
- **Precedence**: BLOCK > REQUIRE_APPROVAL > ALLOW
- **Default**: If policy not found or inactive → `BLOCK` with `POLICY_NOT_FOUND`
- **Custom conditions**: Always return `BLOCK` with `CUSTOM_CONDITION_BLOCK`
- **No match**: If matchedRules.length === 0 → `ALLOW`

### Approval Engine Decision Logic

```
securityLevel === "BLOCKED" → BLOCKED
riskScore >= 70            → BLOCKED
lowConfidence + policy     → BLOCKED (if policy requires)
lowConfidence + customerCount > 50 → REQUIRE_APPROVAL, ADMIN role
lowConfidence + customerCount <= 50 → REQUIRE_APPROVAL, MERCHANT role
amountMinor >= 2000000     → DUAL_APPROVAL_REQUIRED
amountMinor >= 500000 + !merchantAutoApproval → MERCHANT_APPROVAL_REQUIRED
customerCount >= 100       → ADMIN_APPROVAL_REQUIRED
customerCount >= 20        → MERCHANT_APPROVAL_REQUIRED
securityLevel === "SUSPICIOUS" → REQUIRE_APPROVAL, ADMIN role
else                       → NO_APPROVAL_REQUIRED
```

### Customer Protection Decision Logic

```
Same customer + same strategy within cooldown → BLOCK (CUSTOMER_COOLDOWN)
Actions today >= maxPerDay (default 5)        → BLOCK (CUSTOMER_MAX_PER_DAY_EXCEEDED)
Actions this month >= maxPerMonth (default 20) → BLOCK (CUSTOMER_MAX_PER_MONTH_EXCEEDED)
actionType === "REFUND" && actionsToday > 0    → REQUIRE_APPROVAL (REPEATED_DISCOUNT_PATTERN)
else                                           → PASS (CUSTOMER_PROTECTION_PASSED)
```

## Security Considerations

- **No eval(), no arbitrary code execution**: All checks are deterministic comparisons. The policy engine evaluates simple operators (GTE/LTE/EQ/NEQ/GT/LT) against numeric thresholds.
- **No LLM involvement**: Security Agent is entirely deterministic. It does not use any AI/LLM calls.
- **Merchant isolation**: All queries are scoped by `merchantId`. `validateActionRequest()` explicitly checks `expectedMerchantId !== actualMerchantId`.
- **Authentication**: All API routes use `getAuthFromCookies()` to verify JWT tokens from `growthos_token` cookie.
- **Authorization**: Role-based access enforced at route level (MERCHANT, ADMIN roles).
- **Fail-closed**: Critical service failures default to BLOCK.
- **Immutable audit trail**: Every governance decision creates an AuditLog record.
- **Four-eyes principle**: Approval approver cannot be the same as the requester.
- **Server-side only**: All security checks happen server-side; never trust frontend state.

## Data Isolation

- Every `ActionRequest`, `GovernanceDecision`, and `AuditLog` record has a `merchantId`
- `listActionRequests()` returns `[]` if `merchantId !== authenticatedMerchantId`
- `getActionRequest()` queries by `{ id, merchantId }` — returns null if mismatch
- `targetStrategyId` is validated against `merchantId` in Security Agent
- `targetMerchantId` is checked against `merchantId` (merchant isolation violation if different)
- `Policy` records have optional `merchantId` (null = global policy)
- `AuditLog` has optional `merchantId` (null for system events)

## Tests

**No governance-specific tests exist.** The 53 tests in the project cover:

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `tests/validations.test.ts` | 20 | Field validators |
| `tests/data-model.test.ts` | 12 | Financial integrity |
| `tests/authorization.test.ts` | 14 | Role-gating, data isolation |
| `tests/auth.test.ts` | 7 | JWT, password hashing |

The governance modules are tested indirectly through the Next.js build and by the existing test infrastructure. There are no dedicated test files for `policy-engine.ts`, `security-agent.ts`, `approval-engine.ts`, `governance.ts`, or other Phase 4 modules.

## Known Limitations

- `EXECUTION_READY` is defined as a possible final decision but is never actually produced by the current `evaluateGovernance()` logic (it defaults to `BLOCKED` as the fallback)
- Velocity gate uses placeholder `currentCount: 0` in the orchestrator — not dynamically counted
- Kill switch error handling allows by default (less restrictive than fail-closed)
- No rate limiting on governance API endpoints
- No dedicated test coverage for governance modules
- Emergency stop checks `systemHealth.api === "STOPPED"` (not `health.api` as some comments suggest)
- Idempotency uses `governanceDecision.findFirst` with limited dedup logic
- Spend gate only supports INR currency
- Customer protection uses `customerId || ""` which may miss null checks
