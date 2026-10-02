# GrowthOS Phase 10 — Governance Integration

## Risk → Governance
The governance risk gate now accepts actual risk scores from the intelligence engine.

**Input options:**
1. `riskScore: number` — actual computed score (source: `INPUT_SCORE`)
2. `riskLevel: string` — label-based fallback (source: `INPUT_LABEL`)

**Behavior:**
- When actual score is provided, it's used directly in `evaluateRiskGate`
- When only label is available, converted: HIGH→80, MEDIUM→50, LOW→20
- Risk gate thresholds: PASS < 40, REQUIRE_APPROVAL [40-70), BLOCK >= 70

## Confidence → Governance
The governance confidence gate accepts actual confidence scores.

**Input options:**
1. `confidenceScore: number` — actual computed score
2. `confidence: number` — raw input value (existing behavior)

**Behavior:**
- Score passed directly to `evaluateConfidenceGate`
- Gate thresholds: PASS >= 70, REQUIRE_APPROVAL [60-70), BLOCK < 60

## Data Quality → Governance
Already integrated via `evaluateDataQualityGate` which calls `calculateDataQuality`.
- Uses actual merchant data: customerCount, orderCount, historicalSpanDays
- Minimum threshold: 30/100
- Below threshold: BLOCK (unless policy overrides)

## Governance Snapshot
Every governance decision captures a deterministic snapshot:
```json
{
  "evaluatedAt": "...",
  "riskAnalysis": { "riskScore": 78, "riskLevel": "HIGH", "source": "INPUT_SCORE" },
  "confidenceAnalysis": { "confidenceScore": 65, "confidenceLevel": "MEDIUM", "source": "INPUT" },
  "dataQuality": { "dataQualityScore": 58, "insufficient": false },
  "policyVersion": 1,
  "policyId": "...",
  "actionType": "DISCOUNT",
  "strategyId": "...",
  "amountMinor": 50000,
  "currency": "INR"
}
```

## Policy Versioning
- Policy model has `version: Int @default(1)`
- Snapshot captures `policyId` and `policyVersion` at evaluation time
- Historical decisions reference exact policy configuration
- Policy changes don't affect historical audit records

## Traceability Chain
```
Opportunity → Strategy → Simulation → Decision → GovernanceDecision → ActionRequest → Approval → Execution → Outcome
```
Each link persists sufficient context to reconstruct the full decision rationale from database records alone.
