# Phase 10B — AI Buyer + Agent-Readable Commerce

## Overview

GrowthOS now supports an AI Buyer capability that allows merchants and customers to discover products through natural language queries, have the AI select suitable products, and generate validated purchase proposals — all while never bypassing the governance, policy, approval, and deterministic execution pipeline.

## Architecture

```
USER QUERY (natural language)
    ↓
sanitizeAIInput() — removes secrets, limits length
    ↓
parseBuyerIntent() — extracts structured constraints (category, maxPrice, etc.)
    ↓
getAICatalog() — queries product database with merchant isolation + filters
    ↓
AI Provider (deterministic or OpenAI) — selects best product from candidates
    ↓
validateCatalogProduct() — confirms product exists in catalog
    ↓
calculatePricing() — server-side price calculation (NEVER trust AI price)
    ↓
generatePurchaseProposal() — creates structured proposal
    ↓
validateBuyerProposal() — validates product ID, price, quantity, inventory
    ↓
ensureNoDirectExecution() — blocks any direct payment/action
    ↓
Policy Engine + Governance — existing approval pipeline
    ↓
ActionRequest created → PENDING or APPROVED
    ↓
Deterministic Execution → Razorpay (Phase 10C)
```

## Core Principle

**AI NEVER executes. AI only proposes. The server is authoritative for price, inventory, and execution.**

## Files Created

### Service Layer

- `src/lib/ai-buyer/types.ts` — All AI Buyer type definitions
- `src/lib/ai-buyer/catalog.ts` — Catalog transformation, filtering, product mapping
- `src/lib/ai-buyer/selector.ts` — Natural language intent parsing, constraint extraction
- `src/lib/ai-buyer/proposal.ts` — Pricing calculation, selection, proposal generation, validation
- `src/lib/ai-buyer/buyer.ts` — Core buyer service: orchestrates the full flow, creates ActionRequests, audit logs
- `src/lib/ai-buyer/index.ts` — Public exports

### API Routes

- `src/app/api/shop/ai-catalog/route.ts` — `GET /api/shop/ai-catalog` — Agent-readable product catalog
- `src/app/api/shop/ai-buy/route.ts` — `POST /api/shop/ai-buy` — AI Buyer purchase flow

### Tests

- `tests/ai-buyer/ai-buyer.test.ts` — Catalog mapping, filtering, pricing, selection, proposal validation, intent parsing
- `tests/ai-buyer/ai-buyer-integration.test.ts` — Deterministic provider integration, buyer session creation

### Documentation

- `docs/PHASE_10B_AI_BUYER.md` — This file

## APIs

### GET /api/shop/ai-catalog

Returns merchant products in an AI-agent-readable format.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name, description, or category |
| `category` | string | Filter by product category |
| `minPrice` | number | Minimum price filter (INR) |
| `maxPrice` | number | Maximum price filter (INR) |
| `availability` | string | Filter by availability |
| `limit` | number | Limit results |

**Response:**

```json
{
  "catalogVersion": "1",
  "merchant": {
    "id": "...",
    "name": "UrbanWear",
    "currency": "INR"
  },
  "currency": "INR",
  "products": [
    {
      "id": "prod_abc",
      "name": "Urban Runner Pro",
      "description": "Lightweight performance running shoes...",
      "category": "Footwear",
      "price": 4999,
      "currency": "INR",
      "availability": "in_stock",
      "inventory": 45,
      "attributes": { "sku": "UW-SHOE-001", "category": "Footwear" },
      "purchase": {
        "supportsCheckout": true,
        "paymentMethods": ["razorpay"]
      }
    }
  ]
}
```

**Security:**
- Merchant isolation enforced (users only see their merchant's products)
- No secrets exposed (API keys, Razorpay credentials, internal IDs)
- Input validation on all query parameters
- Query length limited to 5000 characters

### POST /api/shop/ai-buy

Processes a natural-language purchase request.

**Request:**

```json
{
  "query": "Find me running shoes under ₹5000",
  "quantity": 1
}
```

**Response (success):**

```json
{
  "success": true,
  "buyerSessionId": "ai-buy-1234567890-abc123",
  "status": "pending_approval",
  "request": {
    "query": "find me running shoes under ₹5000",
    "quantity": 1
  },
  "selection": {
    "productId": "prod_abc",
    "productName": "Urban Runner Pro",
    "quantity": 1
  },
  "pricing": {
    "unitPrice": 4999,
    "total": 4999,
    "currency": "INR"
  },
  "proposal": {
    "id": "ai-prop-1234567890-abc123",
    "requiresApproval": true
  },
  "reason": "Currently in stock; Price is ₹4,999; Category: Footwear"
}
```

**Response (no products):**

```json
{
  "success": false,
  "buyerSessionId": "...",
  "status": "no_products",
  "reason": "No products found matching your criteria"
}
```

**Response (validation failure):**

```json
{
  "success": false,
  "buyerSessionId": "...",
  "status": "validation_failed",
  "reason": "Proposal validation failed: Product ID mismatch..."
}
```

## Security Boundaries

1. **Price Authority**: All prices come from the server catalog (`priceMinor` from Prisma). AI never generates prices.
2. **Product Validation**: Product IDs returned by the AI are verified against the actual catalog.
3. **Inventory Check**: Quantity is validated against actual stock before proposal creation.
4. **No Direct Execution**: `ensureNoDirectExecution()` blocks `DIRECT_PAYMENT`, `RAZORPAY_EXECUTE`, `ISSUE_REFUND`, `CREATE_ORDER`, `MODIFY_POLICY`, `DELETE_DATA` actions.
5. **Input Sanitization**: All queries pass through `sanitizeAIInput()` which removes secrets and limits length.
6. **Merchant Isolation**: Catalog queries are scoped to the authenticated user's merchant.
7. **Audit Trail**: Every buyer request generates an `AuditLog` entry and an `ActionRequest`.

## Deterministic Fallback

When `AI_PROVIDER=deterministic` (default, no API key needed):

1. `parseBuyerIntent()` extracts constraints from natural language
2. `getAICatalog()` returns filtered products
3. The first matching product is selected with 80% confidence
4. The same structured proposal format is generated
5. All validation and security checks remain identical

When `AI_PROVIDER=openai` and `OPENAI_API_KEY` is set:

1. The LLM receives the filtered catalog and user query
2. LLM selects the best matching product
3. Product ID is validated against the catalog server-side
4. All other flows remain identical

## Reused Components

- **Phase 10A**: `sanitizeAIInput()`, `validateAIOutput()`, `ensureNoDirectExecution()`, `initializeAIProvider()`
- **Prisma Models**: `Product`, `ActionRequest`, `AuditLog`, `Merchant`
- **Governance**: `ActionRequest` model for purchase proposals
- **Auth**: `getAuthFromCookies()` for authentication
- **Errors**: `successResponse()`, `unauthorizedResponse()`, `badRequestResponse()`, `errorResponse()`

## Phase 10C Integration Plan

Phase 10B creates validated `ActionRequest` entries with `status: "PENDING"`. Phase 10C will:

1. Implement the approval UI for merchant dashboards
2. Add Razorpay checkout integration using the `ActionRequest.amountMinor`
3. Create `Payment` and `Order` records upon approval
4. Handle webhook callbacks for payment confirmation
5. Implement reconciliation
6. Add learning loop integration

## Testing

Run tests:

```bash
# Run all AI Buyer tests
npx vitest run tests/ai-buyer/

# Run full test suite
npx vitest run

# Type check
npx tsc --noEmit
```

Test coverage includes:
- Product mapping to catalog format
- Catalog filtering (search, category, price, availability)
- Intent parsing (natural language constraints)
- Pricing calculation
- Product selection with reasons
- Proposal generation
- Proposal validation (product ID, price, quantity, inventory)
- Deterministic fallback mode
- Empty query rejection
- No products scenario