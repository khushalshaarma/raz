# GrowthOS Phase 2 Architecture

## Overview

Phase 1 established the foundation: authenticated multi-tenant e-commerce platform with Merchant/Customer/Admin roles, product/customer/order/payment models, and dashboard UIs.

Phase 2 adds **Merchant Intelligence** — transforming the platform from a dashboard into an **intelligence system** that surfaces opportunities and recommendations.

The core philosophy: **deterministic first, LLM second**. All financial calculations, scoring, and rankings must be reproducible from feature values. LLMs (if available) are used only for natural-language explanation, never for computation.

## Intelligence Pipeline

```
Raw Business Data
        ↓
Data Cleaning & Normalisation
        ↓
Feature Engineering (RFM + Customer Attributes)
        ↓
Customer Intelligence (Segmentation + Intelligence)
        ↓
Opportunity Detection (Rule-based first)
        ↓
Opportunity Scoring (Transparent formula)
        ↓
Opportunity Explanation (Evidence-based)
        ↓
Strategy Generation (Multiple candidates)
        ↓
Strategy Ranking (Documented formula)
        ↓
Merchant Recommendation (Human selection, no execution)
```

## Key Principles

1. **Deterministic calculations** — All monetary values, scores, and rankings must be reproducible from input features. No hidden stochasticity.

2. **"Show your work"** — Every opportunity and strategy must include a clear explanation of:
   - Why detected
   - Why now (time-based triggers)
   - Who is affected
   - Evidence (feature values)
   - Estimated value (with formula)
   - Confidence (with source)
   - Assumptions (explicitly stated)
   - Alternatives considered

3. **No execution** — Phase 2 produces recommendations only. No payment execution, no campaign automation, no agent execution.

4. **Merchant data isolation** — All intelligence is scoped by `merchantId` from the authenticated session. A merchant can never access another merchant's intelligence data.

5. **Documented formulas** — Every feature, score, and ranking must have its formula documented in `/docs/PHASE_2_FEATURES.md`.

6. **Agent communication via structured events** — Opportunity detection and strategy generation emit structured internal events (no distributed messaging in Phase 2).

7. **LLM as optional enhancer** — If an LLM is configured, it is used only for:
   - Natural-language rationale generation
   - Strategy description refinement
   - Summary narratives
   
   The LLM must NEVER:
   - Calculate money/ROI
   - Determine confidence
   - Decide strategy selection
   - Bypass business rules

## Data Models (Extension of Phase 1)

### Customer Features (stored as denormalized JSON on Customer, or computed on-the-fly)

| Feature | Type | Formula | Purpose |
|---------|------|---------|---------|
| `recencyDays` | `Int` | `days_between(now(), last_order_date)` | How recently the customer purchased |
| `frequencyTotal` | `Int` | `count(completed_orders)` | Total order count |
| `monetaryTotal` | `Int` | `sum(amountMinor of completed_orders)` | Total spend in paise |
| `aov` | `Int` | `monetaryTotal / frequencyTotal` (if > 0) | Average order value |
| `purchaseFrequencyPerMonth` | `Float` | `frequencyTotal / months_since_first_order` | Orders per month |
| `productDiversity` | `Int` | `count(distinct product_categories_in_orders)` | How many categories the customer buys from |
| `cancellationRate` | `Float` | `count(cancelled_orders) / frequencyTotal` | Ratio of cancellations |
| `activityTrend` | `String` | `increasing / decreasing / stable` | Recent vs historical order count |
| `customerLifetimeMonths` | `Int` | `months_between(first_order_date, now())` | How long the customer has been active |
| `daysSincePreviousPurchase` | `Int` | `days_between(prev_order_date, current_order_date)` | Recency within customer's own history |
| `highValueFlag` | `Boolean` | `monetaryTotal >= merchant_high_value_threshold` | Above-threshold flag |
| `inactivityFlag` | `Boolean` | `recencyDays >= merchant_inactivity_threshold` | Inactivity flag |
| `categoryAffinity` | `String[]` | `modes(product_categories_in_orders)` | Most-frequently bought categories |

### RFM Scoring

Each RFM dimension is scored individually, then combined.

| Dimension | Score Range | Method |
|-----------|-------------|--------|
| R (Recency) | 1-5 | 1 = >365 days, 5 = <30 days |
| F (Frequency) | 1-5 | 1 = 1 order, 5 = 20+ orders |
| M (Monetary) | 1-5 | 1 = <₹1,000, 5 = ₹10,000+ |

**RFM Total** = R + F + M (range 3-15)

**Segments** (business-defined, not medical/financial risk):
- **HIGH_VALUE_LOYAL**: R=5, F=5, M=5 (or total >= 13)
- **HIGH_VALUE_INACTIVE**: R=1-2, F=3-5, M=4-5
- **ACTIVE_GROWING**: R=4-5, F=3-5, M=3-5
- **NEW_CUSTOMER**: R=5, F=1, M=1 (just purchased, low spend yet)
- **LOW_ENGAGEMENT**: R=1-2, F=1-2, M=1-2
- **AT_RISK**: R=1, F=3-5, M=3-5 (active frequency/monetary but very recency)

## Intelligence Service Architecture

```
/src/lib/intelligence/
├── features/           ← Feature engineering calculations
│   ├── recency.ts
│   ├── frequency.ts
│   ├── monetary.ts
│   ├── aov.ts
│   ├── diversity.ts
│   ├── cancellation.ts
│   ├── trend.ts
│   ├── high_value.ts
│   ├── inactivity.ts
│   ├── affinity.ts
│   └── index.ts        ← Feature registry + batch computation
├── customer.ts         ← Customer intelligence queries
├── rfm.ts              ← RFM scoring + segment classification
├── opportunity/        ← Opportunity detection + scoring + explanation
│   ├── detector.ts     ← Rule-based opportunity detection
│   ├── scorer.ts       ← Transparent opportunity scoring
│   ├── explainer.ts    ← Evidence-based explanation generation
│   └── index.ts        ← Opportunity service API
├── strategy/           ← Strategy generation + ranking
│   ├── generator.ts    ← Multiple strategy candidates
│   ├── calculator.ts   ← Financial calculations (revenue, cost, ROI)
│   ├── ranker.ts       ← Strategy ranking formula
│   └── index.ts        ← Strategy service API
├── orchestrator.ts     ← Orchestrator flow coordinator
└── types.ts            ← Shared TypeScript types
```

## API Endpoints (New)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/merchant/intelligence/overview` | MERCHANT | Summary: segment counts, opportunity count, strategy count |
| `GET` | `/api/merchant/intelligence/customers` | MERCHANT | Segment breakdown: customer count, avg spend, AOV per segment |
| `GET` | `/api/merchant/intelligence/opportunities` | MERCHANT | List opportunities with basic info (score, status, type) |
| `GET` | `/api/merchant/intelligence/opportunities/:id` | MERCHANT | Full opportunity detail with evidence and recommended strategy |
| `GET` | `/api/merchant/intelligence/strategies` | MERCHANT | List strategies with ranking and basic stats |
| `GET` | `/api/merchant/intelligence/strategies/:id` | MERCHANT | Full strategy detail with calculations and assumptions |
| `POST` | `/api/merchant/intelligence/analyze` | MERCHANT | Trigger full intelligence run: feature computation → opportunity detection → strategy generation |
| `POST` | `/api/merchant/intelligence/opportunities/:id/review` | MERCHANT | Mark opportunity as REVIEWED (updates status) |
| `POST` | `/api/merchant/intelligence/opportunities/:id/dismiss` | MERCHANT | Mark opportunity as DISMISSED (updates status) |

## Agent Communication Events (Internal, No Distributed System)

| Event | Source | Payload |
|-------|--------|---------|
| `OpportunityDetected` | Opportunity Agent | `{merchantId, opportunityId, opportunityType, timestamp, score}` |
| `StrategyGenerated` | Strategy Agent | `{merchantId, opportunityId, strategyIds, timestamp}` |
| `AnalysisStarted` | Orchestrator | `{merchantId, timestamp}` |
| `AnalysisCompleted` | Orchestrator | `{merchantId, opportunitiesCount, strategiesCount, timestamp}` |
| `AnalysisFailed` | Orchestrator | `{merchantId, error, timestamp}` |

## Documentation (New Files)

- `/docs/PHASE_2_ARCHITECTURE.md` ← This file
- `/docs/PHASE_2_FEATURES.md` ← Feature catalogue with formulas
- `/docs/PHASE_2_AGENTS.md` ← Opportunity Agent + Strategy Agent + Orchestrator descriptions
- `/docs/PHASE_2_INTELLIGENCE.md` ← Intelligence pipeline detailed
- `/docs/PHASE_2_API.md` ← API surface specification
- `/docs/PHASE_2_STATUS.md` ← Phase 2 status report

## Phase 2 vs Phase 1 Boundary

| Phase 1 | Phase 2 |
|---------|---------|
| Dashboard shows static data | Dashboard shows intelligence |
| No customer segmentation | RFM segmentation + segment intelligence |
| No opportunity detection | Rule-based opportunity detection |
| No opportunity scoring | Transparent opportunity scoring |
| No strategy generation | Multiple strategy candidates with ranking |
| No agent orchestration | Orchestrator coordinates Agent flow |
| No explanation | Evidence-based explanations for everything |

## Build Result

- **Production build**: `next build` → succeeds
- **TypeScript**: `tsc --noEmit` → 0 errors (existing + new)
- **Eslint**: `next lint` → no warnings/errors
- **Vitest**: All Phase 1 tests pass + new intelligence tests
- **Dev server**: `next dev` at `http://localhost:3000`

## How To Run (Phase 2 additions)

```bash
npm install                          # (already installed from Phase 1)
npx prisma generate
npx prisma db push                   # May need migration for new fields
npx tsx prisma/seed.ts              # (Phase 1 seed still runs)
npm run dev                          # http://localhost:3000

# New endpoints test:
curl -H "Cookie: growthos_token=..." \
  http://localhost:3000/api/merchant/intelligence/overview

# Trigger intelligence analysis:
curl -X POST -H "Cookie: growthos_token=..." \
  http://localhost:3000/api/merchant/intelligence/analyze
```

## Not Implemented (Phase 2 — Explicitly)

- ❌ Razorpay integration / API calls
- ❌ Payment execution / automatic refunds
- ❌ Campaign automation
- ❌ Autonomous financial transactions
- ❌ LLM-driven financial calculation
- ❌ Real-time agent-to-agent communication
- ❌ Distributed messaging system
- ❌ Production LLM fine-tuning
- ❌ Reconciliation engine
- ❌ Agent execution / dispatch

==================================================
PHASE_2_QUICK_START
============================================================

1. Run Phase 1: `npm run dev`
2. Read: `docs/PHASE_2_ARCHITECTURE.md`, `docs/PHASE_2_FEATURES.md`
3. Feature service auto-registers at `src/lib/intelligence/features/index.ts`
4. Run analysis: `POST /api/merchant/intelligence/analyze` (MERCHANT auth)
5. View: `/merchant/dashboard` → "AI Opportunities" section
5. Explore: `/merchant/opportunities`, `/merchant/strategies`
6. Documentation: `docs/PHASE_2_*.md`

==================================================
END PHASE_2_ARCHITECTURE.md
==================================================