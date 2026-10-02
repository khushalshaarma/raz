# Phase 4 Security Agent

## Purpose

The Security Agent performs deterministic security validation of action requests. It evaluates multiple security dimensions and outputs a security score (0-100) and security level (SECURE, SUSPICIOUS, BLOCKED). It can NEVER approve — it only evaluates. All checks are explicit and deterministic with no LLM involvement.

## Input: SecurityAgentInput

```typescript
interface SecurityAgentInput {
  merchantId: string;              // From authenticated session
  actionRequestId: string;         // Action request ID
  targetMerchantId?: string;       // Target merchant ID
  targetDecisionId?: string;       // Target decision ID
  targetStrategyId?: string;       // Target strategy ID
  amountMinor: number;             // Action amount in paise
  actionType: ActionTypeFull;      // DISCOUNT | CASHBACK | ... | INVALID
  customerId?: string;             // Customer ID (if applicable)
  decisionId?: string;             // Decision ID (if applying to existing)
}
```

## Output: SecurityScoreResult

```typescript
interface SecurityScoreResult {
  securityScore: number;           // 0-100
  securityLevel: "SECURE" | "SUSPICIOUS" | "BLOCKED";
  reasonCodes: Array<string>;
  evidence: Array<{ feature: string; value: string }>;
  explanation: string;
}
```

## Decision Logic

The Security Agent starts with a score of **100** and deducts points for issues. The security level is determined after all checks:

### Security Level Thresholds

```
score >= 70 AND reasonCodes.length === 0  → SECURE
score >= 40                              → SUSPICIOUS
score < 40                               → BLOCKED
```

**Critical override**: If any critical reason code is present (`MERCHANT_ISOLATION_VIOLATION`, `INVALID_ACTION_TYPE`), the level is immediately set to `BLOCKED` regardless of score.

### Deduction Rules

| Check | Deduction | Reason Code | Evidence |
|-------|-----------|-------------|----------|
| Merchant not found | -50 | `MERCHANT_NOT_FOUND` | Merchant ID |
| Database error (merchant lookup) | -30 | `DATABASE_ERROR` | — |
| Invalid action type | -40 | `INVALID_ACTION_TYPE` | Action type value |
| Invalid amount (not positive integer) | -30 | `INVALID_AMOUNT` | Amount value |
| Merchant isolation violation | -40 | `MERCHANT_ISOLATION_VIOLATION` | Target merchant, Auth merchant |
| Decision not found | -20 | `DECISION_NOT_FOUND` | Decision ID |
| Strategy not found or isolation violation | -20 | `STRATEGY_NOT_FOUND_OR_ISOLATION_VIOLATION` | Strategy ID |
| Suspicious repetition (repeatCount > 10) | -30 | `SUSPICIOUS_REPETITION` | Repeat count |
| Database error (strategy lookup) | -10 | — | — |
| Database error (decision lookup) | -10 | — | — |

### Check Details

1. **Validate merchant exists and is active**: Query `prisma.merchant.findUnique({ where: { id: merchantId } })`. If not found, deduct 50 points.
2. **Validate action type**: Check against valid action types list. If invalid, deduct 40 points.
3. **Validate amount**: Must be a positive integer (`typeof amountMinor === "number" && amountMinor > 0 && Number.isInteger(amountMinor)`). If invalid, deduct 30 points.
4. **Merchant isolation**: If `targetMerchantId && targetMerchantId !== merchantId`, deduct 40 points and flag `MERCHANT_ISOLATION_VIOLATION`.
5. **Validate target decision** (if provided): Query `prisma.decision.findUnique({ where: { id: targetDecisionId } })`. If not found, deduct 20 points.
6. **Validate target strategy** (if provided): Query `prisma.scenario.findFirst({ where: { id: targetStrategyId, merchantId } })`. If not found, deduct 20 points.
7. **Check suspicious repetition**: Count action requests for the same merchant, strategy, and opportunity type (excluding current). If count > 10, deduct 30 points.
8. **Policy consistency**: Noted but not evaluated by the Security Agent (done separately by Policy Engine).

### Score Clamping

Final score is clamped: `Math.max(0, Math.min(100, score))`.

## Failure Behavior

- **Database errors** during individual checks are caught in try-catch blocks and result in score deductions (not hard failures)
- If merchant lookup fails: -30 points, `DATABASE_ERROR` reason code
- If decision lookup fails: -10 points
- If strategy lookup fails: -10 points
- If repetition check fails (database error): silently ignored
- **No hard fail**: The function always returns a result, even if some checks fail

## Security Considerations

- **Deterministic**: All security evaluations use explicit if/else logic and numeric comparisons. No randomness, no ML/LLM.
- **No eval()**: No dynamic code execution anywhere.
- **No LLM**: The Security Agent does not use any AI/LLM calls.
- **Server-side only**: All checks happen server-side. Never trust frontend state.
- **Merchant isolation**: `targetMerchantId` must match `merchantId` (the authenticated user's merchant). This is explicitly validated.
- **Strategy isolation**: Strategy lookup includes `merchantId` in the query, ensuring the strategy belongs to the authenticated merchant.
- **Evidence trail**: Every check produces evidence entries (`{ feature, value }`) for auditability.
- **Critical code override**: `MERCHANT_ISOLATION_VIOLATION` and `INVALID_ACTION_TYPE` immediately escalate to `BLOCKED`.

## Data Isolation

- All queries are scoped by `merchantId` from the authenticated session
- `targetStrategyId` query includes `merchantId` filter
- The Security Agent does NOT directly access other merchants' data
- Evidence entries record the actual values checked, not the underlying data

## Tests

**No dedicated tests exist for the Security Agent.** The 53 project-wide tests do not cover security agent behavior. There are no unit tests for `evaluateSecurity()`.
