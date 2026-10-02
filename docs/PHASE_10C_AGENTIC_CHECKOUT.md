# Phase 10C — Agentic Checkout + Razorpay Payment Integration

## Overview

Phase 10C completes the AI Buyer flow by turning validated purchase proposals into real payment transactions through Razorpay. The entire flow remains deterministic — the AI can only propose, never execute.

## Architecture

```
AI Buyer Proposal (ActionRequest, status: APPROVED)
         ↓
POST /api/shop/ai-checkout
         ↓
1. Authenticate & authorize
2. Retrieve ActionRequest
3. Verify merchant ownership
4. Verify approval status
5. Revalidate product (price, stock, active)
6. Detect price changes (stale proposal protection)
7. Create Execution record
8. Create Razorpay order
9. Return checkout credentials
         ↓
Frontend launches Razorpay Checkout
         ↓
Razorpay webhook callback
         ↓
Signature verification
         ↓
Update Execution status
         ↓
Update ActionRequest status
         ↓
Audit log
         ↓
Reconciliation
         ↓
Learning outcome
```

## APIs

### POST /api/shop/ai-checkout

Initiates checkout for an approved AI Buyer proposal.

**Request:**
```json
{
  "proposalId": "action-request-id"
}
```

**Response (success):**
```json
{
  "success": true,
  "checkoutId": "chk-1234567890-abc123",
  "status": "CHECKOUT_READY",
  "orderId": "execution-id",
  "razorpayOrderId": "razorpay_order_abc",
  "amount": 4999,
  "currency": "INR",
  "keyId": "rzp_test_xxx"
}
```

**Response (price changed):**
```json
{
  "success": false,
  "checkoutId": "chk-1234567890-abc123",
  "status": "PRICE_CHANGED",
  "amount": 5499,
  "currency": "INR",
  "error": "Price changed: proposal was ₹4999, current price is ₹5499"
}
```

**Response (stale proposal):**
```json
{
  "success": false,
  "checkoutId": "chk-1234567890-abc123",
  "status": "NOT_APPROVED",
  "error": "Proposal not approved"
}
```

### GET /api/shop/ai-order-status?checkoutId=...

Polls the status of a checkout.

**Response:**
```json
{
  "checkoutId": "chk-1234567890-abc123",
  "status": "SUCCEEDED",
  "amount": 4999,
  "currency": "INR",
  "providerReference": "razorpay_order_abc",
  "createdAt": "2026-09-25T01:42:00Z",
  "updatedAt": "2026-09-25T01:42:30Z",
  "actionStatus": "EXECUTED"
}
```

## Payment State Machine

```
CREATED
  ↓
PREFLIGHT  (execution validated)
  ↓
SUBMITTED  (Razorpay order created)
  ↓
AUTHORIZED (payment authorized)
  ↓
CAPTURED   (payment captured)
  ↓
SUCCEEDED  (payment confirmed)

Failure paths:
  FAILED
  CANCELLED
  EXPIRED
```

## Webhook Security

The existing webhook infrastructure (`src/app/api/webhooks/razorpay/route.ts`) already handles:

1. **Signature verification** — `verifyRazorpayWebhookSignature()` using HMAC-SHA256
2. **Duplicate detection** — `WebhookEvent` model prevents double processing
3. **Idempotent processing** — Events marked `PROCESSED` are skipped
4. **Atomic updates** — `prisma.$transaction()` ensures consistency
5. **AI Buyer-specific audit** — New `processAIBuyerOutcome()` function logs AI Buyer payment events

## Security Properties

1. **Server-authoritative pricing** — Price is re-fetched from database at checkout time
2. **Price change protection** — If product price changed since proposal, checkout is blocked with `PRICE_CHANGED`
3. **Inventory revalidation** — Stock is re-checked immediately before order creation
4. **No AI execution** — AI Buyer can never directly call Razorpay
5. **Merchant isolation** — Every operation verifies `merchantId` matches the authenticated user
6. **No secrets exposed** — Only `keyId` is returned; `keySecret` never leaves the server
7. **Idempotency** — Same proposal cannot create duplicate orders
8. **Webhook signature** — `RAZORPAY_WEBHOOK_SECRET` required for production verification

## Idempotency

The checkout process uses the existing `createExecutionIdempotencyRecord()` function:
- Same `proposalId` can only create one checkout
- Duplicate requests return `ALREADY_PROCESSED`
- Execution lock prevents concurrent processing

## Failure Handling

| Failure | Status | User Message |
|---------|--------|-------------|
| Proposal not found | `NOT_FOUND` | Proposal not found |
| Proposal not approved | `NOT_APPROVED` | Proposal not approved |
| Merchant mismatch | `MERCHANT_ISOLATION` | Merchant isolation violation |
| Product deleted | `PRODUCT_INVALID` | Product not found |
| Product inactive | `PRODUCT_INACTIVE` | Product is no longer active |
| Low stock | `INSUFFICIENT_INVENTORY` | Insufficient inventory |
| Price changed | `PRICE_CHANGED` | Price changed — reconfirm |
| Already processed | `ALREADY_PROCESSED` | Checkout already processed |
| Razorpay error | `RAZORPAY_ERROR` | Failed to create order |
| Payment failed | `FAILED` | Payment failed |

## Learning Integration

After successful payment (webhook `captured` event):
1. Webhook creates `AuditLog` entry for `AI_BUYER_PAYMENT_SUCCESS`
2. Reconciliation runs automatically
3. Outcome recorded in `Execution` model
4. Learning system can query `AgentRun`/`AgentProposal` for AI Buyer outcomes

## Demo Scenario

**Merchant:** UrbanFit
**Product:** Velocity Runner (₹4,499)
**AI Buyer Request:** "Find me running shoes under ₹5,000"

```
10:42  AI Buyer request → "Find me running shoes under ₹5000"
10:42  Catalog queried → 2 products found
10:42  Velocity Runner selected → ₹4,499 verified from server
10:42  Inventory verified → 12 in stock
10:42  Purchase Proposal created → ActionRequest approved
10:43  POST /api/shop/ai-checkout → CHECKOUT_READY
10:43  Razorpay order created → razorpay_order_abc
10:43  Frontend launches Razorpay Checkout
10:44  Payment captured → webhook received
10:44  Execution updated → SUCCEEDED
10:44  ActionRequest updated → EXECUTED
10:44  AuditLog created → AI_BUYER_PAYMENT_SUCCESS
10:44  Reconciliation → MATCHED
```

## Files Created/Modified

### Created
- `src/lib/ai-buyer/checkout.ts` — Core checkout orchestration
- `src/app/api/shop/ai-checkout/route.ts` — Checkout API
- `src/app/api/shop/ai-order-status/route.ts` — Order status API
- `tests/ai-buyer/ai-checkout.test.ts` — Checkout tests
- `docs/PHASE_10C_AGENTIC_CHECKOUT.md` — This documentation

### Modified
- `src/lib/ai-buyer/buyer.ts` — Added `evidence` field to ActionRequest
- `src/lib/ai-buyer/types.ts` — Added `CheckoutInput`, `CheckoutResult`, `CheckoutStatus`
- `src/app/api/webhooks/razorpay/route.ts` — Added `processAIBuyerOutcome()`
- `src/app/merchant/dashboard/page.tsx` — Added checkout/completion metrics

## Reused Infrastructure

- **Execution model** — `Execution`, `ExecutionAttempt`, `ExecutionEvent`
- **Razorpay provider** — `createRazorpayOrder()`, `getRazorpayClient()`
- **Webhook processing** — `processWebhookEvent()`, signature verification
- **Reconciliation** — `reconcileExecution()`
- **Idempotency** — `createExecutionIdempotencyRecord()`
- **Audit logs** — `AuditLog` model
- **ActionRequest** — Approval state machine
- **Governance** — Existing approval pipeline

## Phase 10D Integration Plan

Phase 10C creates `Execution` records with `actionType: "AI_BUYER_PURCHASE"`. Phase 10D could implement:
1. AI Buyer dashboard analytics
2. Customer purchase history
3. Product recommendation improvements
4. Automated reorder suggestions
5. Multi-product bundling