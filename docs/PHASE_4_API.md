# Phase 4 API Routes

All Phase 4 API routes require authentication via JWT cookie (`growthos_token`). Unauthenticated requests return 401.

## Authentication

All routes use `getAuthFromCookies()` to extract the JWT payload from the cookie. The payload includes `userId`, `email`, `role` (MERCHANT/CUSTOMER/ADMIN), and `merchantId`.

## Route Summary

| Method | Path | Role Required | Purpose |
|--------|------|---------------|---------|
| POST | `/api/merchant/governance/evaluate` | MERCHANT | Evaluate governance for an action |
| GET | `/api/merchant/governance/actions` | MERCHANT | List action requests |
| POST | `/api/merchant/governance/actions` | MERCHANT | Create action request |
| GET | `/api/merchant/governance/actions/[id]` | MERCHANT | Get specific action request |
| POST | `/api/merchant/governance/approvals/[id]/approve` | MERCHANT/ADMIN | Approve pending decision |
| POST | `/api/merchant/governance/approvals/[id]/reject` | MERCHANT/ADMIN | Reject pending decision |
| POST | `/api/merchant/governance/automation/pause` | MERCHANT/ADMIN | Pause automation |
| POST | `/api/merchant/governance/automation/resume` | MERCHANT/ADMIN | Resume automation |
| GET | `/api/admin/security` | ADMIN | Admin security dashboard |

---

## 1. Evaluate Governance

**POST** `/api/merchant/governance/evaluate`

### Request Body
```json
{
  "actionType": "DISCOUNT",
  "strategyId": "strategy-uuid",
  "recommendedScenario": "CONSERVATIVE",
  "decisionScore": 85,
  "riskLevel": "LOW",
  "confidence": 90,
  "amountMinor": 5000,
  "currency": "INR",
  "rationale": "Promotional discount",
  "evidence": "...",
  "policyId": "policy-uuid",
  "customerCount": 100,
  "orderCount": 500,
  "historicalSpanDays": 90,
  "customerId": "customer-uuid"
}
```

### Response
```json
{
  "governance": {
    "governanceDecision": "APPROVED",
    "actionRequestId": "req-uuid",
    "merchantId": "merchant-uuid",
    "dataQualityGate": { "decision": "PASS", "dataQualityScore": 85, "insufficient": false, "reasonCode": "DATA_QUALITY_SUFFICIENT" },
    "confidenceGate": { ... },
    "riskGate": { ... },
    "security": { "securityScore": 100, "securityLevel": "SECURE", "reasonCodes": [] },
    "policyEngine": { ... },
    "velocity": { ... },
    "spend": { ... },
    "customerProtection": { ... },
    "approvalEngine": { ... },
    "allReasonCodes": [],
    "explanation": "...",
    "evaluatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### Error Responses
- `401` — Unauthorized (no JWT cookie)
- `400` — No merchant associated
- `500` — Governance evaluation failed

### Security
- Requires valid JWT with `MERCHANT` role
- Merchant ID extracted from JWT session
- All evaluation is server-side and deterministic

---

## 2. List Action Requests

**GET** `/api/merchant/governance/actions`

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (PENDING, APPROVED, BLOCKED, etc.) |
| `actionType` | string | Filter by opportunity type |
| `skip` | number | Pagination offset (default: 0) |
| `take` | number | Page size (default: 20) |

### Response
```json
{
  "actions": [
    {
      "id": "req-uuid",
      "merchantId": "merchant-uuid",
      "opportunityType": "DISCOUNT",
      "strategyId": "...",
      "strategyName": "...",
      "recommendedScenario": null,
      "decisionScore": 0,
      "riskLevel": "",
      "confidence": 0,
      "status": "PENDING",
      "reason": null,
      "evidence": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### Security
- Requires valid JWT with `MERCHANT` role
- Results filtered by authenticated `merchantId`
- If `merchantId !== authenticatedMerchantId`, returns `[]`

---

## 3. Create Action Request

**POST** `/api/merchant/governance/actions`

### Request Body
```json
{
  "actionType": "DISCOUNT",
  "strategyId": "strategy-uuid",
  "recommendedScenario": "CONSERVATIVE",
  "decisionScore": 85,
  "riskLevel": "LOW",
  "confidence": 90,
  "amountMinor": 5000,
  "currency": "INR",
  "rationale": "Promotional discount",
  "evidence": "...",
  "policyId": "policy-uuid",
  "customerCount": 100,
  "orderCount": 500,
  "historicalSpanDays": 90
}
```

### Required Fields
- `actionType`, `strategyId`, `amountMinor` must be present

### Response
```json
{
  "actionRequest": {
    "id": "req-uuid",
    "merchantId": "merchant-uuid",
    "opportunityType": "DISCOUNT",
    ...
  }
}
```

### Error Responses
- `400` — Missing required fields
- `401` — Unauthorized
- `500` — Failed to create action request

### Validation
- `amountMinor` must be a non-negative integer
- `currency` must be a non-empty string
- Invalid `actionType` creates a BLOCKED request with reason

---

## 4. Get Action Request

**GET** `/api/merchant/governance/actions/[id]`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Action request ID |

### Response
```json
{
  "actionRequest": { ... }
}
```

### Error Responses
- `401` — Unauthorized
- `400` — No merchant associated
- `404` — Action request not found or access denied

### Security
- Merchant isolation enforced: only returns if `merchantId === authenticatedMerchantId`

---

## 5. Approve Governance Decision

**POST** `/api/merchant/governance/approvals/[id]/approve`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Governance decision ID |

### Response
```json
{
  "message": "Governance decision approved",
  "decisionId": "decision-uuid",
  "approvedBy": "user-uuid"
}
```

### Error Responses
- `401` — Unauthorized
- `404` — Governance decision not found
- `400` — Decision is not pending approval

### Security
- **Four-eyes principle**: Approver cannot be the same as the requester
- Decision must be in `PENDING` status
- Updates `GovernanceDecision` status to `APPROVED`, sets `approvedBy` and `approvedAt`
- Creates `AuditLog` with `action: "APPROVAL_APPROVED"`, `severity: "INFO"`
- **Note**: The four-eyes check is documented in the code comment but NOT enforced programmatically in the route handler (no explicit check that `approvedBy !== decision.merchantId` or similar)

---

## 6. Reject Governance Decision

**POST** `/api/merchant/governance/approvals/[id]/reject`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Governance decision ID |

### Response
```json
{
  "message": "Governance decision rejected",
  "decisionId": "decision-uuid"
}
```

### Error Responses
- `401` — Unauthorized
- `404` — Governance decision not found
- `400` — Decision is not pending approval

### Security
- Decision must be in `PENDING` status
- Updates `GovernanceDecision` status to `BLOCKED`, sets `decisionReason: "Rejected by approver"`
- Creates `AuditLog` with `action: "APPROVAL_REJECTED"`, `severity: "WARNING"`

---

## 7. Pause Automation

**POST** `/api/merchant/governance/automation/pause`

### Response
```json
{
  "automation": {
    "state": "PAUSED",
    "isAutomationAllowed": false,
    "wasPaused": true,
    "reason": "AUTOMATION_PAUSED",
    "pausedBy": "user-uuid",
    "pausedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### Error Responses
- `401` — Unauthorized
- `400` — No merchant associated
- `403` — Insufficient permissions (role must be MERCHANT or ADMIN)

### Security
- Requires `MERCHANT` or `ADMIN` role
- Creates a `Policy` record named `AUTOMATION_PAUSED` with `isActive: true`
- The kill switch check in `governance.ts` looks for this policy

---

## 8. Resume Automation

**POST** `/api/merchant/governance/automation/resume`

### Response
```json
{
  "automation": {
    "state": "ACTIVE",
    "isAutomationAllowed": true,
    "wasPaused": false
  }
}
```

### Error Responses
- `401` — Unauthorized
- `400` — No merchant associated
- `403` — Insufficient permissions

### Security
- Requires `MERCHANT` or `ADMIN` role
- Deactivates the `AUTOMATION_PAUSED` policy by setting `isActive: false`

---

## 9. Admin Security Dashboard

**GET** `/api/admin/security`

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `merchantId` | string | Optional filter by merchant |

### Response
```json
{
  "blockedActions": [...],
  "securityViolations": [...],
  "velocityViolations": [...],
  "emergencyStopActive": false,
  "totalBlocked": 0,
  "totalCritical": 0
}
```

### Error Responses
- `401` — Unauthorized
- `403` — Admin access required
- `500` — Failed to fetch security data

### Security
- Requires `ADMIN` role only
- Returns recent blocked actions (last 20), critical audit logs (last 20), velocity violations (last 20)
- Checks emergency stop status via `SystemHealth` table
- Supports optional `merchantId` filtering

---

## Rate Limiting

**No rate limiting is implemented** on any Phase 4 API endpoint. There is no rate limiter middleware or configuration in the codebase.

## Security Considerations

1. **JWT authentication**: All routes use `getAuthFromCookies()` to verify the `growthos_token` cookie
2. **Role-based access**: MERCHANT routes require MERCHANT role; admin routes require ADMIN role
3. **Merchant isolation**: All merchant-scoped queries filter by `merchantId` from the JWT session
4. **No CORS configuration visible**: Default Next.js CORS behavior applies
5. **HttpOnly cookies**: JWT stored in `HttpOnly`, `Secure` (in production), `SameSite: lax` cookies
6. **Session expiration**: JWT expires in 7 days (`TOKEN_EXPIRY = "7d"`)
7. **No CSRF protection visible**: Cookie-based auth without explicit CSRF tokens

## Examples

### Evaluate Governance
```bash
curl -X POST http://localhost:3000/api/merchant/governance/evaluate \
  -H "Cookie: growthos_token=<JWT>" \
  -H "Content-Type: application/json" \
  -d '{"actionType":"DISCOUNT","strategyId":"...","amountMinor":5000}'
```

### Approve Decision
```bash
curl -X POST http://localhost:3000/api/merchant/governance/approvals/{id}/approve \
  -H "Cookie: growthos_token=<JWT>"
```

### Pause Automation
```bash
curl -X POST http://localhost:3000/api/merchant/governance/automation/pause \
  -H "Cookie: growthos_token=<JWT>"
```

### Admin Security Dashboard
```bash
curl -X GET http://localhost:3000/api/admin/security \
  -H "Cookie: growthos_token=<ADMIN_JWT>"
```
