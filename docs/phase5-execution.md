# Phase 5: Real Execution + Razorpay Integration

## Overview
Phase 5 implements the real execution pipeline for GrowthOS. It is the first phase that executes real external financial side effects, but **only** after governance approval. The execution flow follows a strict chain: GOVERNANCE APPROVED → PREFLIGHT → IDEMPOTENCY → LOCK → RAZORPAY ADAPTER → WEBHOOK → RECONCILIATION → OUTCOME → LEARNING.

## Architecture

### Execution Pipeline
```
Governance Decision (APPROVED)
    ↓
runExecutionPreflight()
    ↓ (status: READY)
createExecutionIdempotencyRecord()
    ↓
acquireExecutionLock()
    ↓
executeProviderAction() → Razorpay API
    ↓
Webhook received → processWebhookEvent()
    ↓
reconcileAndRecord()
    ↓
recordExecutionOutcome()
```

### Key Principles
- **Fail-closed**: Any critical service failure → BLOCKED
- **Governance-first**: No execution proceeds without approved governance decision
- **Idempotency**: Every execution has a unique idempotency key; duplicates are rejected
- **Reconciliation**: Provider state is always verified against GrowthOS state
- **Test mode only**: `RAZORPAY_MODE=test`; no live credentials in repository

## File Structure

### Execution Domain (`src/lib/execution/`)
| File | Purpose |
|------|---------|
| `types.ts` | Type definitions: ExecutionStatus, FailureCategory, PreflightResult, etc. |
| `preflight.ts` | Pre-execution checks: governance, kill switch, automation pause, idempotency |
| `idempotency.ts` | Idempotency record creation and duplicate detection |
| `executor.ts` | Main execution entry point; dispatches to provider adapters |
| `result.ts` | Records execution events and updates execution status |
| `failure.ts` | Failure classification (NETWORK, PROVIDER, PAYMENT_DECLINED, etc.) |
| `reconciliation.ts` | Verifies execution state against provider state |
| `outcome.ts` | Records actual outcomes for learning/feedback loop |
| `execution-service.ts` | High-level service: executeAction(), getExecutionDetails() |

### Razorpay Provider (`src/lib/execution/providers/razorpay/`)
| File | Purpose |
|------|---------|
| `config.ts` | Validates Razorpay configuration and monetary amounts |
| `client.ts` | Singleton Razorpay client factory |
| `orders.ts` | Create/fetch Razorpay orders |
| `payments.ts` | Fetch payment details |
| `refunds.ts` | Create/fetch refunds |
| `signatures.ts` | Webhook signature verification (HMAC-SHA256) |
| `webhooks.ts` | Webhook event processing and deduplication |

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/merchant/executions` | GET/POST | List/create merchant executions |
| `/api/webhooks/razorpay` | POST | Receive Razorpay webhook events |
| `/api/merchant/reconciliation` | GET/POST | View/trigger reconciliation |
| `/api/admin/executions` | GET | Admin execution monitoring |
| `/api/admin/reconciliation` | GET/POST | Admin reconciliation management |

### UI Pages
| Page | Purpose |
|------|---------|
| `/merchant/executions` | Merchant execution dashboard |
| `/admin/executions` | Admin execution monitoring |
| `/admin/reconciliation` | Admin reconciliation dashboard |

### Tests (`tests/execution/`)
| File | Tests | Purpose |
|------|-------|---------|
| `execution.test.ts` | 16 | Types, preflight, idempotency, failure, isolation, reconciliation, config |
| `security.test.ts` | 10 | Governance enforcement, webhook security, money validation |
| `e2e-execution.test.ts` | 6 | Full lifecycle, emergency stop, automation pause, retry classification |
| **Total** | **32** | **All passing** |

## Kill Switch / Emergency Stop
The preflight checks the most recent `SystemHealth` record. If the latest record indicates `application !== "ok"` or `api !== "ok"`, execution is blocked with `EMERGENCY_STOP`.

```typescript
const latestHealth = await prisma.systemHealth.findFirst({
  orderBy: { lastCheckedAt: "desc" },
});
if (!latestHealth || latestHealth.application !== "ok" || latestHealth.api !== "ok") {
  return { status: "EMERGENCY_STOP", reason: "Emergency stop active" };
}
```

## Failure Classification
| Category | Examples | Recoverable | Retry |
|----------|----------|-------------|-------|
| NETWORK_ERROR | TIMEOUT, ECONNREFUSED | Yes | Yes |
| PROVIDER_ERROR | SERVER_ERROR, INTERNAL | Yes | Yes |
| PAYMENT_DECLINED | CARD_DECLINED | No | No |
| INSUFFICIENT_FUNDS | INSUFFICIENT | No | No |
| AUTH_ERROR | UNAUTHORIZED | No | No |
| VALIDATION_ERROR | INVALID_REQUEST | No | No |
| DUPLICATE | ALREADY_EXISTS | No | No |
| UNKNOWN | (unrecognized) | No | No |

## Environment Variables
```
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
```

## Test Results
- **Governance tests**: 123/123 passing (16 test files)
- **Execution tests**: 32/32 passing (3 test files)
- **Total**: 155/155 passing
- **TypeScript**: 0 errors (tsc --noEmit)
