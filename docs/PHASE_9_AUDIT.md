# GrowthOS Phase 9 — Repository Audit

## 1. Project Overview

GrowthOS is a merchant intelligence and decision platform built with:
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **ORM**: Prisma 6.11
- **Database**: SQLite
- **Auth**: JWT (jose) + cookies
- **Payments**: Razorpay SDK
- **Testing**: Vitest
- **Styling**: Tailwind CSS

## 2. Database Models (34 total)

| # | Model | Purpose |
|---|-------|---------|
| 1 | User | Authentication, roles |
| 2 | Merchant | Business entity |
| 3 | Customer | Customer records |
| 4 | Product | Product catalog |
| 5 | Order | Purchase orders |
| 6 | OrderItem | Line items |
| 7 | Payment | Payment records |
| 8 | Campaign | Marketing campaigns |
| 9 | Scenario | Simulation scenarios |
| 10 | Simulation | Simulation runs |
| 11 | Decision | Decision records |
| 12 | DecisionOutcome | Prediction tracking |
| 13 | StrategyExperiment | Calibration data |
| 14 | Opportunity | Detected opportunities |
| 15 | ActionRequest | Governance action requests |
| 16 | Policy | Governance policies |
| 17 | PolicyRule | Policy conditions |
| 18 | GovernanceDecision | Governance outcomes |
| 19 | AuditLog | Audit trail |
| 20 | Agent | Agent registry |
| 21 | AuditEvent | Event audit trail |
| 22 | SystemHealth | System status |
| 23 | Execution | Execution records |
| 24 | ExecutionAttempt | Retry attempts |
| 25 | WebhookEvent | Webhook events |
| 26 | Reconciliation | Payment reconciliation |
| 27 | GrowthCycle | Agentic growth cycles |
| 28 | AgentRun | Agent execution runs |
| 29 | AgentTask | Agent task queue |
| 30 | AgentMessage | Inter-agent messages |
| 31 | AgentProposal | Agent proposals |
| 32 | AgentMemory | Agent memory |
| 33 | AgentEvent | Agent events |
| 34 | AutopilotConfig | Autopilot settings |

## 3. API Routes (51 total)

### Authentication (3)
- POST `/api/auth/login`
- POST `/api/auth/register`
- GET `/api/auth/me`

### System (1)
- GET `/api/system/health`

### Shop (1)
- GET `/api/shop/products`

### Webhooks (1)
- POST `/api/webhooks/razorpay`

### Policies (3)
- GET/POST `/api/policies`
- GET/PUT/DELETE `/api/policies/[id]`
- POST `/api/policies/[id]/toggle`

### Merchant (28)
- GET `/api/merchant/overview`
- GET `/api/merchant/dashboard`
- GET `/api/merchant/products`
- GET `/api/merchant/customers`
- GET `/api/merchant/customers/segments`
- GET `/api/merchant/orders`
- GET `/api/merchant/payments`
- GET `/api/merchant/payments/health`
- GET `/api/merchant/campaigns`
- GET `/api/merchant/opportunities`
- GET `/api/merchant/opportunities/stats`
- GET/PATCH `/api/merchant/opportunities/[id]`
- GET/POST `/api/merchant/strategies`
- GET `/api/merchant/strategies/[id]`
- GET/POST `/api/merchant/simulations`
- GET `/api/merchant/simulations/[id]`
- GET `/api/merchant/decisions`
- GET `/api/merchant/decisions/[id]`
- GET/POST `/api/merchant/executions`
- POST `/api/merchant/governance/evaluate`
- GET/POST `/api/merchant/governance/actions`
- GET `/api/merchant/governance/actions/[id]`
- POST `/api/merchant/governance/approvals/[id]/approve`
- POST `/api/merchant/governance/approvals/[id]/reject`
- POST `/api/merchant/governance/automation/pause`
- POST `/api/merchant/governance/automation/resume`
- GET `/api/merchant/agents`
- GET/POST `/api/merchant/growth-cycles`
- GET/PUT `/api/merchant/autopilot`
- GET `/api/merchant/reconciliation`
- GET `/api/merchant/audit`
- GET `/api/merchant/timeline`
- GET `/api/merchant/growth-score`

### Customer (3)
- GET `/api/customer/me`
- GET/POST `/api/customer/orders`
- GET `/api/customer/orders/[id]`

### Admin (7)
- GET `/api/admin/dashboard`
- GET `/api/admin/agents`
- GET `/api/admin/executions`
- GET `/api/admin/audit`
- GET `/api/admin/reconciliation`
- GET `/api/admin/security`
- POST `/api/admin/emergency-stop`

## 4. UI Pages (48 total)

### Public (3)
- `/`, `/login`, `/register`

### Customer (4)
- `/customer`, `/customer/shop`, `/customer/products/[id]`, `/customer/orders`

### Merchant (31)
- Dashboard, Products, Customers, Customer Segments, Orders, Payments, Payment Health, Campaigns, Opportunities, Opportunity Detail, Strategies, Strategy Detail, Simulations, Simulation Detail, Decisions, Decision Detail, Executions, Execution Detail, Governance, Policies, Approvals (governance), Approval Detail, Approvals (center), Agents, Growth Cycles, Autopilot, Reconciliation, Timeline, Security, Audit, Settings

### Admin (8)
- Dashboard, Merchants, Agents, Executions, Audit, Reconciliation, Security, Health

## 5. Integration Gaps Identified

### GAP 1: Simulation → Decision Not Linked
**Location**: `src/lib/product/simulation-center.ts:184-282`
**Issue**: `runSimulation()` creates Simulation + Scenarios but does NOT create a Decision record.
**Impact**: Simulations and Decisions are disconnected in the product flow.

### GAP 2: Opportunity → Strategy Not Linked
**Location**: `src/app/merchant/opportunities/[id]/page.tsx`
**Issue**: No API route exists to generate strategies from an opportunity context.
**Impact**: User cannot flow from opportunity detail to strategy generation.

### GAP 3: Webhook → Governance Status Not Updated
**Location**: `src/app/api/webhooks/razorpay/route.ts:37-77`
**Issue**: Webhook updates Execution status but not GovernanceDecision.executedAt or ActionRequest.status.
**Impact**: Governance records remain stale after execution.

### GAP 4: Duplicate formatMoney (5 implementations)
**Locations**: `scorer.ts:15`, `generator.ts:487`, `monetary.ts:19`, `risk.ts:149,164`, `security/money.ts:35`
**Issue**: Five independent formatMoney implementations with slight variations.
**Risk**: Inconsistent financial display.

### GAP 5: No Prisma Transactions
**Issue**: Zero `$transaction()` calls in the entire codebase. Multi-step DB operations lack atomicity.
**Locations**: governance.ts (decision+audit), simulation-center.ts (simulation+scenarios), executor.ts (attempt+status)

### GAP 6: Governance Persistence Errors Swallowed
**Location**: `governance/governance.ts:485-488`
**Issue**: `catch (error) { allReasonCodes.push("PERSISTENCE_ERROR") }` — decision may not be saved.

### GAP 7: Kill Switch/Emergency Stop Fail-Open
**Locations**: `kill-switch.ts:73-81`, `emergency-stop.ts:21-23`
**Issue**: On error, defaults to "ACTIVE" (not paused) / "not enabled" — opposite of fail-closed.

### GAP 8: Confidence/Risk Analysis Never Called
**Locations**: `intelligence/confidence.ts`, `intelligence/risk.ts`
**Issue**: `runConfidenceAnalysis()` and `runRiskAnalysis()` exported but never called from any route or agent.

## 6. Financial Safety

All monetary values stored as `Int` (paise) in Prisma. Floating-point division (`paise/100`) only occurs in display formatting. No floating-point arithmetic on stored money values. **Acceptable pattern.**

## 7. Security

- Auth: JWT with `growthos_token` cookie
- RBAC: MERCHANT/CUSTOMER/ADMIN enforced in middleware
- Merchant isolation: `merchantGuard()` extracts merchantId from JWT
- Rate limiting: IP-based in middleware
- Security headers: Set in middleware
- Webhook verification: Razorpay signature check

**Finding**: Hardcoded JWT secret fallback in `auth.ts:6` and `config/env.ts:38`. Safe for dev but must be overridden in production.

## 8. Test Coverage (382 tests, 45 files)

| Domain | Files | Tests |
|--------|-------|-------|
| Root (auth, validation, data model) | 4 | ~20 |
| Security | 11 | ~40 |
| Governance | 16 | ~80 |
| Agents | 12 | ~60 |
| Execution | 3 | ~15 |
| Integration (e2e) | 3 | ~15 |

## 9. Documentation (19 files)

Phase 1-8 progress documents exist. Phase 9 documentation to be created.
