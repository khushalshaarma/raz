# Phase 4 Policy Engine

## Purpose

The Policy Engine evaluates governance policies against action context data to produce an ALLOW, BLOCK, or REQUIRE_APPROVAL decision. Policies are stored in the `Policy` Prisma model and can be scoped to individual merchants or global (null merchantId).

## Input: PolicyEvaluationContext

```typescript
interface PolicyEvaluationContext {
  riskScore: number;
  confidenceScore: number;
  dataQualityScore: number;
  velocity: number;
  spendMinor: number;
  customerSegment?: string;
  custom?: Record<string, number | string | boolean>;
}
```

## Output: PolicyEvaluationResult

```typescript
interface PolicyEvaluationResult {
  decision: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
  policyId: string | null;
  policyVersion: number;
  matchedRules: Array<{ ruleKey: string; ruleValue: number; operator: ConditionOperator }>;
  violations: Array<{ ruleKey: string; reasonCode: string }>;
  reasonCodes: Array<string>;
  evaluatedAt: Date;
  isActive: boolean;
}
```

## Policy Model (Prisma)

The Policy engine reads from the `Policy` model:

```prisma
model Policy {
  id               String   @id @default(uuid())
  merchantId       String?  // null = global policy
  name             String
  version          Int      @default(1)
  conditionType    String   // DATA_QUALITY | RISK_SCORE | CONFIDENCE_SCORE | VELOCITY | SPEND | CUSTOMER_SEGMENT | CUSTOM
  conditionOperator String  // GTE | LTE | EQ | NEQ | GT | LT
  conditionValue   Int
  conditionExpression String? // JSON - full rule logic
  action           String   // ALLOW | BLOCK | REQUIRE_APPROVAL
  priority         Int      @default(100)
  isActive         Boolean @default(true)
}
```

## Condition Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `GTE` | Greater than or equal | `riskScore >= threshold` |
| `LTE` | Less than or equal | `confidenceScore <= threshold` |
| `EQ` | Equal | `dataQualityScore === threshold` |
| `NEQ` | Not equal | `velocity !== threshold` |
| `GT` | Greater than | `spendMinor > threshold` |
| `LT` | Less than | `riskScore < threshold` |

## Condition Types and Context Mapping

| Condition Type | Context Field | Segment Mapping (for CUSTOMER_SEGMENT) |
|----------------|--------------|----------------------------------------|
| `RISK_SCORE` | `context.riskScore` | — |
| `CONFIDENCE_SCORE` | `context.confidenceScore` | — |
| `DATA_QUALITY` | `context.dataQualityScore` | — |
| `VELOCITY` | `context.velocity` | — |
| `SPEND` | `context.spendMinor` | — |
| `CUSTOMER_SEGMENT` | `context.customerSegment` | VIP=100, PREMIUM=75, STANDARD=50, ECONOMY=25 |
| `CUSTOM` | `context.custom[ruleKey]` | Must be a number in custom record |

## Decision Logic

### Evaluation Process

1. **Fetch Policy**: Look up policy by `id` from Prisma. If not found or `isActive === false`, return `BLOCK` with `POLICY_NOT_FOUND`.
2. **Evaluate Rule**: Call `evaluatePolicyRule(policy, context)`:
   - Get the context value for the policy's `conditionType`
   - If value is undefined → return `NEUTRAL` with `NO_VALUE_FOR_{ruleKey}`
   - If operator is undefined → return `NEUTRAL` with `UNSUPPORTED_OPERATOR`
   - If conditionType is `CUSTOM` → return `BLOCK` with `CUSTOM_CONDITION_BLOCK`
   - Apply the operator comparison: conditionMet ? `ALLOW` : `BLOCK`
3. **Accumulate Result**:
   - If rule decision is `BLOCK` → add violation, set finalDecision to `BLOCK`
   - If rule decision is `REQUIRE_APPROVAL` → set finalDecision to `REQUIRE_APPROVAL` (only if not already BLOCK)
   - If rule decision is `ALLOW` → keep current finalDecision (only if currently ALLOW)
4. **Final Precedence**: After evaluating the policy rule:
   - If any violation has reasonCode containing `POLICY_BLOCK` → finalDecision = `BLOCK`
   - Else if any violation has reasonCode containing `POLICY_REQUIRE_APPROVAL` → finalDecision = `REQUIRE_APPROVAL`
   - **Precedence**: BLOCK > REQUIRE_APPROVAL > ALLOW

### Rule Evaluation Result

```
conditionMet === true  → decision: "ALLOW", reasonCode: "POLICY_ALLOW"
conditionMet === false → decision: "BLOCK", reasonCode: "POLICY_BLOCK"
value === undefined    → decision: "NEUTRAL", reasonCode: "NO_VALUE_FOR_{ruleKey}"
unsupported operator   → decision: "NEUTRAL", reasonCode: "UNSUPPORTED_OPERATOR"
conditionType === "CUSTOM" → decision: "BLOCK", reasonCode: "CUSTOM_CONDITION_BLOCK"
```

### Matched Rules

When a rule is evaluated, it is always added to `matchedRules`:
```typescript
{ ruleKey: policy.conditionType, ruleValue: policy.conditionValue, operator: policy.conditionOperator }
```

If `matchedRules.length === 0` after evaluation, `finalDecision` defaults to `ALLOW`.

## Failure Behavior

- **Policy not found or inactive**: Returns `BLOCK` with `POLICY_NOT_FOUND` reason code, `policyId: null`, `policyVersion: 0`, `isActive: false`
- **No value for condition type**: Returns `NEUTRAL` — rule is skipped, not a violation
- **Unsupported operator**: Returns `NEUTRAL` — rule is skipped
- **Custom condition**: Always returns `BLOCK` with `CUSTOM_CONDITION_BLOCK`
- **Database error**: The `evaluatePolicy` function is called within a try-catch in `governance.ts`, but `evaluatePolicy` itself does not catch errors internally. If the Prisma query fails, it propagates up.

## Security Considerations

- **No eval()**: The policy engine does NOT use `eval()` or any dynamic code execution. All comparisons are simple numeric operators.
- **No arbitrary code execution**: Policy rules are simple threshold comparisons against predefined condition types.
- **No LLM**: The policy engine is entirely deterministic — no AI/LLM involvement.
- **ConditionExpression field**: The `conditionExpression` field exists in the Policy model (JSON string) but is NOT evaluated by `evaluatePolicy()`. It is only read in `evaluateSpendGate()` to determine which limit to apply.
- **Operator whitelist**: Only GTE, LTE, EQ, NEQ, GT, LT are accepted. Any other operator returns `NEUTRAL`.
- **Type safety**: `ConditionOperator` is a TypeScript union type enforcing the six valid operators.

## Data Isolation

- Policies are looked up by `id` (not by merchantId)
- The `Policy` model has an optional `merchantId` field: `null` = global policy, specific value = merchant-scoped
- `evaluatePolicy` takes a `policyId` parameter — it does not filter by merchant
- The governance orchestrator passes `input.policyId || "default-policy"` to `evaluatePolicy`
- If the policy belongs to a different merchant, it will still be evaluated if the ID matches

## Tests

**No dedicated tests exist for the Policy Engine.** The 53 project-wide tests (validations, data-model, authorization, auth) do not cover policy engine behavior. The policy engine is indirectly exercised through the governance orchestrator in the Next.js build, but there are no unit tests for `evaluatePolicy()`.
