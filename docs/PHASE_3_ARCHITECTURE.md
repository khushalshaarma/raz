# GrowthOS Phase 3 Architecture — Decision Intelligence

## Overview

Phase 3 transforms GrowthOS from a descriptive intelligence platform ("what opportunities exist?") into a prescriptive decision intelligence platform ("what is likely to happen if we use each strategy, which is most suitable, why, and how confident are we?").

## Pipeline

```
Phase 2 Output
  ↓
  Opportunity
    ↓
    Strategies (2–4 candidates)
    ↓
┌─────────────────────────────┐
│  PHASE 3: DECISION INTELLIGENCE│
│                               │
│  Scenario Engine              │
│    ↓                          │
│  Simulation Agent             │
│    ↓                          │
│  Scenario Results             │
│    ↓                          │
│  Decision Engine              │
│    ↓                          │
│  Recommendation Score         │
│    ↓                          │
│  Explainable Decision         │
│    ↓                          │
│  Learning Engine              │
│    ↓                          │
│  Historical Memory            │
└─────────────────────────────┘
    ↓
  RECOMMENDED ACTION
    ↓
  HUMAN REVIEW
    ↓
  PHASE 4 (policy, approval, execution)
```

## Core Principle

**Phase 3 produces SIMULATED DECISIONS, not EXECUTED ACTIONS.**

- No Razorpay execution
- No payment API calls
- No payment retries, refunds, or reconciliation
- No campaign sending or customer messaging
- No external side effects

Every simulation has:
- Input data (from Phase 2 feature engineering)
- Documented assumptions
- Deterministic formulas
- Scenario parameters
- Output (financial impact, conversions, ROI)
- Uncertainty quantification
- Evidence traceability

## Modules

| Module | Responsibility |
|--------|---------------|
| Scenario Engine | Build conservative/expected/optimistic scenarios from baseline |
| Simulation Agent | Run scenarios, calculate financial impact, emit results |
| Risk Engine | Compute risk score (0–100) and rating (LOW/MEDIUM/HIGH) |
| Confidence Engine | Compute confidence (0–100) from data quality, sample size, historical similarity |
| Decision Engine | Weighted scoring of strategies, produce recommendation |
| Learning Engine | Track prediction errors, calibrate future estimates, store experiments |
| Baseline Calculator | Compute "do nothing" baseline from historical data |
| Incremental Impact Calculator | Compute strategy revenue minus baseline revenue |

## Key Formulas

### Expected Revenue
```
expectedRevenue = expectedConversions × historicalAOV
```

### Expected Conversions
```
expectedConversions = eligibleCustomers × expectedConversionRate
```

### Expected Net Impact
```
expectedNetImpact = expectedRevenue − expectedCost
```

### Expected ROI
```
expectedROI = expectedNetImpact / expectedCost   (undefined when cost = 0)
```

### Incremental Revenue
```
incrementalRevenue = strategyRevenue − baselineRevenue
```

### Incremental Net Impact
```
incrementalNetImpact = strategyNetImpact − baselineNetImpact
```

### Confidence (0–100)
```
confidence = dataQualityWeight + sampleSizeWeight + historicalSimilarityWeight + stabilityWeight
```
Normalized to 0–100. Each component documented.

### Risk Score (0–100)
```
riskScore = uncertaintyPenalty + costDownsidePenalty + dataQualityPenalty + incentiveSizePenalty
```
Normalized to 0–100. Lower = safer.

### Decision Score (0–100)
```
decisionScore = incrementalImpactWeight + roiWeight + confidenceWeight − riskPenalty + evidenceWeight
```
Normalized to 0–100. Weights configurable.

### Prediction Error
```
absoluteError = |predicted − actual|
percentageError = absoluteError / max(|actual|, 1) × 100
```
Zero-denominator safe. Never produces NaN or Infinity.

## Scenario Types

| Type | Multiplier | Description |
|------|-----------|-------------|
| CONSERVATIVE | baseline × 0.80 | Lower expected conversion/response |
| EXPECTED | baseline × 1.00 | Historical/central estimate |
| OPTIMISTIC | baseline × 1.20 | Higher response estimate based on evidence |

Multipliers are configurable and documented. Historical variance preferred when available.

## Decision Categories

- `STRONG_RECOMMENDATION` — high confidence, strong incremental impact, low risk
- `RECOMMEND` — positive incremental impact, moderate risk
- `LOW_CONFIDENCE_RECOMMENDATION` — positive impact but insufficient data
- `NO_CLEAR_WINNER` — all strategies have poor incremental impact
- `DO_NOT_ACT` — no strategy produces sufficient incremental value relative to cost and uncertainty

## Agent Communication Events

```
OpportunityDetected
  ↓
StrategyGenerated
  ↓
SimulationRequested
  ↓
SimulationCompleted
  ↓
DecisionGenerated
  ↓
DecisionExplained
  ↓
StrategySelected
  ↓ (Phase 4/5 will own)
OutcomeRecorded
```

## Database Schema Additions

New Prisma models (see migration):

- `Scenario` — scenario results per strategy
- `Simulation` — simulation run metadata and results
- `Decision` — decision engine output with recommendation
- `DecisionOutcome` — actual vs predicted outcomes for learning
- `StrategyExperiment` — historical experiment memory for calibration

## Merchant Isolation

All Phase 3 data is scoped by `merchantId` from the authenticated session.

- Merchant A sees only their simulations, decisions, and learning data
- Merchant A cannot see Merchant B's data
- Customers cannot access merchant intelligence APIs

## LLM Boundary

If an LLM is configured:
- **Allowed**: explanation, summarization, natural language reasoning, decision narrative
- **Not allowed**: financial calculation, ROI calculation, scenario calculation, risk calculation, authorization, execution

Correct architecture:
```
Structured Data → Deterministic Simulation → Deterministic Decision → Structured Result → LLM Explanation → Validation → UI
```

If LLM fails, deterministic explanation templates are used. The application still works.

## Constraints

- No Kafka, microservices, distributed workers, Kubernetes, vector database, complex ML training pipeline
- No unnecessary AI framework, autonomous payment execution, external campaign execution
- GrowthOS remains a modular monolith
- TypeScript strict mode
- No `any`, no `@ts-ignore`
- No duplicated business logic
- No business logic in React components
- All monetary values in integer paise
- Safe zero-denominator handling everywhere
- Prisma queries scoped by merchantId
- Backward compatible with Phase 1 and Phase 2
