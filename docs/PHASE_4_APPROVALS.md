# Phase 4 Approval Engine

## Purpose

The Approval Engine determines whether an action request requires approval, and if so, what level of approval is needed. It implements the **four-eyes principle** (approver ≠ requester) and enforces role-based approval requirements (MERCHANT, ADMIN, or DUAL).

## Input: ApprovalEngineInput

```typescript
interface ApprovalEngineInput {
  riskScore: number;
  confidenceScore: number;
  amountMinor: number;
  actionType: ActionTypeFull;
  customerCount: number;
  securityResult: {
    securityLevel: "SECURE" | "SUSPICIOUS" | "BLOCKED";
    reasonCodes: Array<string>;
  };
  policyId?: string;
  merchantAutoApproval?: boolean;    // Default: false
  adminOverrideAvailable?: boolean;  // Default: false
}
```

## Output: ApprovalResult

```typescript
interface ApprovalResult {
  decision:
    | "NO_APPROVAL_REQUIRED"
    | "MERCHANT_APPROVAL_REQUIRED"
    | "ADMIN_APPROVAL_REQUIRED"
    | "DUAL_APPROVAL_REQUIRED"
    | "REQUIRE_APPROVAL"
    | "BLOCKED";
  requiresFourEyes: boolean;
  requiredRole: "MERCHANT" | "ADMIN" | "DUAL";
  expiresAt?: Date;
  reasonCode: string;
  explanation: string;
}
```

## Decision Logic

The evaluation follows this priority order (first match wins):

### 1. Security Block
If `securityResult.securityLevel === "BLOCKED"` → `decision: "BLOCKED"`, reasonCode: `SECURITY_BLOCKED`

### 2. Risk Too High
If `riskScore >= 70` → `decision: "BLOCKED"`, reasonCode: `RISK_TOO_HIGH_FOR_APPROVAL`

### 3. Low Confidence
If `confidenceScore < 60`:
- If policy exists and is active with `conditionType === "CONFIDENCE_SCORE"` and `conditionOperator === "LTE"` and `policy.conditionValue >= confidenceScore` → `decision: "BLOCKED"`, reasonCode: `CONFIDENCE_LOW_POLICY_APPROVAL`
- Otherwise: `decision: "REQUIRE_APPROVAL"`, `requiresFourEyes: true`
  - If `customerCount > 50` → `requiredRole: "ADMIN"`
  - If `customerCount <= 50` → `requiredRole: "MERCHANT"`
  - reasonCode: `CONFIDENCE_TOO_LOW`

### 4. Very Large Amount
If `amountMinor >= 2000000` (₹20,000) → `decision: "DUAL_APPROVAL_REQUIRED"`, `requiresFourEyes: true`, `requiredRole: "DUAL"`, reasonCode: `AMOUNT_VERY_LARGE`

### 5. Large Amount
If `amountMinor >= 500000` (₹5,000) AND `merchantAutoApproval === false` → `decision: "MERCHANT_APPROVAL_REQUIRED"`, `requiresFourEyes: true`, `requiredRole: "MERCHANT"`, reasonCode: `AMOUNT_LARGE`

### 6. Large Customer Base
If `customerCount >= 100` → `decision: "ADMIN_APPROVAL_REQUIRED"`, `requiresFourEyes: true`, `requiredRole: "ADMIN"`, reasonCode: `LARGE_CUSTOMER_BASE`

### 7. Moderate Customer Base
If `customerCount >= 20` → `decision: "MERCHANT_APPROVAL_REQUIRED"`, `requiresFourEyes: true`, `requiredRole: "MERCHANT"`, reasonCode: `MODERATE_CUSTOMER_BASE`

### 8. Security Suspicious
If `securityResult.securityLevel === "SUSPICIOUS"` → `decision: "REQUIRE_APPROVAL"`, `requiresFourEyes: true`, `requiredRole: "ADMIN"`, reasonCode: `SECURITY_SUSPICIOUS`

### 9. No Approval Required
Default → `decision: "NO_APPROVAL_REQUIRED"`, `requiresFourEyes: false`, `requiredRole: "MERCHANT"`, reasonCode: `NO_APPROVAL_NEEDED`

## Four-Eyes Principle

- When `requiresFourEyes === true`, the approver must be a different person than the requester
- This is enforced at the API level in `approvals/[id]/approve/route.ts`:
  ```typescript
  // Approver cannot be the same as the requester (four-eyes)
  const decision = await prisma.governanceDecision.findUnique({ where: { id: params.id } });
  // ... approval requires different user ID
  ```
- The `approvedBy` field in `GovernanceDecision` stores the approver's user ID
- The `approvedAt` timestamp records when approval was granted

## Approval Expiration

- The `ApprovalResult` interface has an optional `expiresAt?: Date` field, but it is **never set** in the current implementation
- The approval route checks `if (decision.approvedAt && decision.approvedAt > new Date())` but this logic is inverted (already approved decisions pass this check regardless)
- **In practice, approvals do not expire** in the current code

## Decision Precedence Summary

```
BLOCKED (security or risk) > BLOCKED (policy) > DUAL_APPROVAL_REQUIRED > MERCHANT_APPROVAL_REQUIRED > ADMIN_APPROVAL_REQUIRED > REQUIRE_APPROVAL > NO_APPROVAL_REQUIRED
```

The first matching condition in the evaluation order wins.

## Security Considerations

- **Role-based access**: Approval decisions are role-specific (MERCHANT, ADMIN, DUAL)
- **Four-eyes enforcement**: Approver cannot be the requester
- **Server-side evaluation**: All approval logic happens server-side
- **No auto-approval bypass**: `merchantAutoApproval` parameter exists but defaults to `false`
- **Admin override**: `adminOverrideAvailable` parameter exists but is **not used** in any decision logic
- **Audit trail**: Every approval/rejection creates an `AuditLog` record

## Data Isolation

- The approval engine receives `securityResult` from the Security Agent (which already validated merchant isolation)
- The `GovernanceDecision` record is scoped by `merchantId`
- Approval/rejection routes query by `id` only — any user with the ID can attempt approval (relying on the frontend to enforce access control)

## Tests

**No dedicated tests exist for the Approval Engine.** The 53 project-wide tests do not cover approval engine behavior. There are no unit tests for `evaluateApproval()`.
