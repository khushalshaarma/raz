# GrowthOS Phase 9 — Integration Map

## Overview
This document maps every integration point between GrowthOS modules, showing how data flows end-to-end.

## End-to-End Flow

```
Data Ingestion → Opportunity Detection → Strategy Generation → Simulation
    → Decision → Governance → Approval → Execution → Webhook → Reconciliation
```

## Module Integration Points

### 1. Data → Opportunity
**File**: `src/lib/intelligence/opportunity/scorer.ts`
- `scoreOpportunities()` reads Customer, Order, Payment data
- Creates Opportunity records with evidence, severity, monetaryValue
- Transitions: DETECTED → IN_REVIEW → ACTIONED

### 2. Opportunity → Strategy
**File**: `src/lib/intelligence/strategy/generator.ts`
- `generateStrategiesForHighValueInactive()` — win-back campaigns
- `generateStrategiesForCartAbandonment()` — recovery flows
- `generateStrategiesForUpsell()` — value expansion
- `generateStrategiesForCrossSell()` — category expansion
- **API**: `POST /api/merchant/opportunities/[id]` triggers strategy generation
- Persists StrategyExperiment records and links to opportunity

### 3. Strategy → Simulation
**File**: `src/lib/product/simulation-center.ts`
- `createSimulation()` saves configuration
- `runSimulation()` executes against real data, generates scenarios
- Creates a Decision record automatically after simulation completes

### 4. Simulation → Decision
**File**: `src/lib/product/simulation-center.ts:runSimulation()`
- Determines `decisionCategory` using same formula as `intelligence/decision.ts`
- Creates Decision record with category, confidence, reasoning
- Links Simulation to Decision via `simulationId`

### 5. Decision → Governance
**File**: `src/lib/governance/governance.ts`
- `evaluateGovernance()` runs 17-step pipeline:
  1. Policy compliance
  2. Risk assessment
  3. Confidence analysis
  4. Security agent
  5. Approval chain
  6. Financial safety
  7. Data quality
- Returns GOVERNANCE_APPROVED or GOVERNANCE_BLOCKED
- **Fail-closed**: throws on persistence failure (not swallowed)

### 6. Governance → Approval
**File**: `src/app/api/merchant/governance/approvals/[id]/approve.ts`
- `POST /api/merchant/governance/approvals/[id]/approve` — approves action
- `POST /api/merchant/governance/approvals/[id]/reject` — rejects action
- Updates GovernanceDecision.status = APPROVED or REJECTED

### 7. Approval → Execution
**File**: `src/lib/execution/executor.ts`
- `executeAction()` validates:
  1. Automation not paused (kill switch)
  2. Emergency stop not active
  3. Governance approved
  4. Merchant isolation
- Creates Execution record + ExecutionAttempt

### 8. Execution → Webhook
**File**: `src/app/api/webhooks/razorpay/route.ts`
- `processPaymentEvent()` handles `payment.captured`, `payment.failed`
- Updates Execution status (PENDING → SUCCEEDED/FAILED)
- **Now updates** GovernanceDecision.executedAt + ActionRequest.status
- Records AuditEvent for webhook receipt

### 9. Webhook → Reconciliation
**File**: `src/lib/execution/reconciliation.ts`
- Compares Execution records against Payment records
- Detects mismatches (paid but not executed, executed but not paid)
- Creates Reconciliation records

### 10. Execution → Learning
**File**: `src/lib/agents/learning.ts`
- `recordLearningOutcome()` captures outcome
- Feeds back to AgentMemory for future decisions

## Security Architecture Order (enforced)
```
AUTH → VALIDATION → SECURITY → INTELLIGENCE → DECISION → GOVERNANCE → APPROVAL → EXECUTION
```
This order is never bypassed. Each step must pass before the next is evaluated.

## Kill Switch & Emergency Stop
- **Kill Switch** (`src/lib/governance/kill-switch.ts`): Pauses automation for a merchant
  - **Fail-closed**: defaults to PAUSED on error
- **Emergency Stop** (`src/lib/governance/emergency-stop.ts`): Blocks ALL automated actions globally
  - **Fail-closed**: defaults to ENABLED on error
- **UI**: `/merchant/governance` page, `/merchant/approvals` page

## Financial Safety
- All monetary values stored as `Int` (paise) in Prisma
- `formatMoney()` in `src/lib/product/format.ts` — single source of truth
- No floating-point arithmetic on stored values
- Display formatting divides by 100 only for display
