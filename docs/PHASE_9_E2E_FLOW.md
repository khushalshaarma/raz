# GrowthOS Phase 9 — E2E Flow Verification

## Complete User Journey

### Flow 1: Merchant Discovers Opportunity
```
1. Merchant logs in → JWT stored in growthos_token cookie
2. Navigates to /merchant/opportunities
3. Page calls GET /api/merchant/opportunities
4. API authenticates via merchantGuard()
5. Opportunity Center queries Customer + Order + Payment data
6. Opportunities displayed with severity, monetaryValue, evidence
7. Merchant clicks into opportunity detail (/merchant/opportunities/[id])
8. Can dismiss, action, or generate strategies
```

### Flow 2: Opportunity → Strategy Generation
```
1. Merchant on opportunity detail page
2. Clicks "Generate Strategy"
3. POST /api/merchant/opportunities/[id] triggered
4. API determines opportunity type (HIGH_VALUE_INACTIVE, CART_ABANDONMENT, UPSELL, CROSS_SELL)
5. Calls appropriate strategy generator function
6. Persists StrategyExperiment records
7. Updates opportunity status → REVIEWING
8. Returns strategies with expected impact and confidence
```

### Flow 3: Strategy → Simulation → Decision
```
1. Merchant navigates to /merchant/strategies
2. Selects strategy, clicks "Run Simulation"
3. POST /api/merchant/simulations creates simulation
4. Simulation Center executes against real customer data
5. Generates 3 scenarios: baseline, optimistic, pessimistic
6. After simulation save, Decision record created automatically
7. Decision linked to simulation via simulationId
8. Merchant can view simulation results with SIMULATED banner
```

### Flow 4: Decision → Governance → Approval
```
1. Decision created (from simulation or manual)
2. ActionRequest created for execution
3. Governance evaluation triggered (17-step pipeline)
4. If governance blocks → GOVERNANCE_BLOCKED (fail-closed)
5. If governance approves → GOVERNANCE_APPROVED
6. Action appears in /merchant/approvals
7. Merchant approves/rejects with 4-eyes pattern
8. GovernanceDecision updated to APPROVED/REJECTED
```

### Flow 5: Approval → Execution → Webhook
```
1. Action approved
2. executeAction() called
3. Validates: kill switch OK, emergency stop OK, governance approved
4. Creates Execution record
5. Creates ExecutionAttempt
6. Calls Razorpay API (or simulates)
7. Webhook arrives: POST /api/webhooks/razorpay
8. processPaymentEvent() updates Execution status
9. Updates GovernanceDecision.executedAt
10. Updates ActionRequest.status = EXECUTED
11. Records AuditEvent
```

### Flow 6: Webhook → Reconciliation
```
1. Payment captured via webhook
2. Execution marked SUCCEEDED
3. Reconciliation service runs
4. Compares Execution records against Payment records
5. Detects: paid but not executed, executed but not paid
6. Creates Reconciliation records with status
7. Merchant views on /merchant/reconciliation
```

### Flow 7: Execution → Learning
```
1. Execution completes (success or failure)
2. Learning agent records outcome
3. AgentMemory updated with what worked/didn't
4. Future decisions informed by historical outcomes
5. Visible in /merchant/timeline as AgentEvent
```

## Security Verification

### Authentication
- All `/api/merchant/*` routes require JWT in `growthos_token` cookie
- `merchantGuard()` extracts merchantId from JWT payload
- No URL/body merchantId spoofing possible

### Authorization
- Middleware enforces MERCHANT/CUSTOMER/ADMIN roles
- Customer routes only accessible with CUSTOMER role
- Admin routes only accessible with ADMIN role

### Merchant Isolation
- Every data query includes `merchantId` filter
- Cross-merchant access blocked at API level
- `security-agent.test.ts` verifies BLOCKED on cross-merchant proposals

### Fail-Closed Behavior
- Kill switch: defaults to PAUSED on error
- Emergency stop: defaults to ENABLED on error
- Governance: throws on persistence failure (not swallowed)
- All critical failures block, never allow

## Test Coverage

| Flow | Test File | Tests |
|------|-----------|-------|
| Opportunity Detection | `tests/intelligence/opportunity-scorer.test.ts` | 6 |
| Strategy Generation | `tests/intelligence/strategy-generator.test.ts` | 10 |
| Simulation | `tests/product/simulation-center.test.ts` | 12 |
| Decision | `tests/product/decision-center.test.ts` | 10 |
| Governance | `tests/governance/governance.test.ts` | 6 |
| Kill Switch | `tests/governance/kill-switch.test.ts` | 6 |
| Emergency Stop | `tests/governance/emergency-stop.test.ts` | 4 |
| Fail-Closed | `tests/governance/fail-closed.test.ts` | 7 |
| Execution | `tests/execution/execution.test.ts` | 6 |
| E2E Execution | `tests/execution/e2e-execution.test.ts` | 4 |
| E2E Agentic Cycle | `tests/integration/e2e-agentic-cycle.test.ts` | 8 |
| Orchestrator | `tests/agents/orchestrator.test.ts` | 5 |
| **Total** | **45 files** | **382** |
