# GrowthOS Phase 1 API Surface

## Base URL

All API routes are relative to `http://localhost:3000/api/`

## Authentication

| Method | Endpoint | Auth Required | Notes |
|--------|----------|---------------|-------|
| `POST` | `/api/auth/login` | **No** | Body: `{email, password}`. Returns JWT + sets `growthos_token` HttpOnly cookie. |
| `POST` | `/api/auth/register` | **No** | Body: `{name, email, password, role?}`. Creates user + sets cookie. Redirects by role. |
| `GET` | `/api/auth/me` | **Yes** (cookie) | Returns current user payload from verified JWT. |
| `POST` | `/api/auth/logout` | **Yes** (cookie) | Clears `growthos_token` cookie. Returns `{"message":"Logged out"}`. |

**Auth flow**: Login → server sets `growthos_token` cookie → middleware verifies cookie on every subsequent request → injects `x-user-id`, `x-user-role`, `x-merchant-id` headers → route handlers scope queries by `merchantId`.

## Merchant API

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| `GET` | `/api/merchant/dashboard` | MERCHANT | Stats: totalRevenue, totalOrders, totalCustomers, conversionRate; recentOrders (last 5) |
| `GET` | `/api/merchant/products` | MERCHANT | Paginated list of merchant's products (active-only for shop view) |
| `POST` | `/api/merchant/products` | MERCHANT | Create product. Body: `{name, description, priceMinor, sku, category, stock?, imageUrl?}` |
| `GET` | `/api/merchant/customers` | MERCHANT | List all customers with order counts |
| `GET` | `/api/merchant/orders` | MERCHANT | List all orders (with customer, items, payment summaries) |
| `GET` | `/api/merchant/payments` | MERCHANT | List all payments (provider, status, amount, associated order) |
| `GET` | `/api/merchant/campaigns` | MERCHANT | List all campaigns (name, status, budget, target audience) |
| `GET` | `/api/merchant/opportunities` | MERCHANT | List all opportunities (title, type, estimatedRevenueMinor, confidence, status) |
| `GET` | `/api/merchant/agents` | MERCHANT | List all agents (name, type, status, description) |
| `GET` | `/api/merchant/audit` | MERCHANT | Last 100 audit events (action, actorType, severity, timestamp) |
| `GET` | `/api/merchant/security` | MERCHANT | Security center — coming in Phase 3+ |
| `GET` | `/api/merchant/reconciliation` | MERCHANT | Reconciliation engine — coming in Phase 4+ |
| `GET` | `/api/merchant/settings` | MERCHANT | Account info (role, currency, timezone); advanced settings in Phase 5 |

## Customer API

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| `GET` | `/api/customer/shop` | CUSTOMER | Browse products available to this customer (filtered by their merchant) |
| `GET` | `/api/shop/products` | CUSTOMER | Same as above — root shop endpoint |
| `GET` | `/api/shop/products/[id]` | CUSTOMER | Product detail page: name, description, price, stock, "Add to Cart" (disabled if out of stock) |
| `GET` | `/api/customer/orders` | CUSTOMER | List customer's own orders (with items, totals, payment status, dates) |
| `GET` | `/api/customer/orders/[id]` | CUSTOMER | Specific order detail: items, totals, payment info, status, date |
| `GET` | `/api/customer/me` | CUSTOMER | Current customer profile (name, email, phone, join date) or `null` if guest |

## Admin API

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| `GET` | `/api/admin/dashboard` | ADMIN | Platform stats: totalMerchants, activeUsers, totalProducts, totalOrders, totalCustomers, totalRevenue; recentAuditEvents (last 20); merchant list (with product/order/customer counts) |
| `GET` | `/api/admin/merchants` | ADMIN | List all registered merchants (businessName, owner, status, currency, timezone, product/customer/order counts) |
| `GET` | `/api/admin/audit` | ADMIN | Last 100 audit events across all merchants (action, actorType, merchantId, severity, timestamp) |
| `GET` | `/api/admin/health` | ADMIN | System health: application, api, database, environment, lastCheckedAt |

## System API

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| `GET` | `/api/system/health` | **Public** | Application, API, and database status. `{application, api, database, environment, lastCheckedAt}`. Updates `SystemHealth` record in DB. |

## Response Formats

### Success

```json
{ "success": true, "data": { ... } }
```

Most endpoints return `successResponse(data)` which wraps in `{ data }`. The exact shape depends on the endpoint (see individual endpoint summaries above).

### Error

```json
{ "error": "Error message describing the problem" }
```

- **400 Bad Request**: Missing/invalid required fields (used by product POST validation)
- **401 Unauthorized**: No or invalid JWT cookie
- **403 Forbidden**: JWT valid but wrong role for the endpoint
- **404 Not Found**: Order/customers not found
- **500 Internal Error**: Server-side failure

All errors use `errorResponse(message, status)` returning `{ error: message }` with appropriate HTTP status.

## Authorization Semantics

- **Middleware**: Checks `growthos_token` cookie → JWT verification → role prefix match (`/merchant`, `/customer`, `/admin`).
  - Missing/invalid token → 401, redirect to `/login`
  - Wrong role → 403 Forbidden
- **Route handlers**: Secondary gate using `authorizeRoutes(user, allowedRoles)` helper.
  - If `!user` → 401
  - If `user.role ∉ allowedRoles` → 403
  - If authenticated + correct role → proceed with merchantId scoping

**Never trust the frontend for authorization**. The same API endpoint returns different data depending on the authenticated user's role. A merchant calling `/api/merchant/orders` only sees their merchant's orders; a customer calling `/api/customer/orders` only sees their own orders; an admin sees all orders.

## Money Format

All monetary amounts in API responses are **integers** representing minor currency units:

- `priceMinor: 499900` means `₹4,999.00`
- `totalMinor: 7976300` means `₹79,763.00`
- `amountMinor: 150000` means `₹1,500.00`
- **Never** floating-point representations in JSON responses from the API.

## Error Codes Summary

| Code | Meaning | When |
|------|---------|------|
| `400` | Bad Request | Invalid product price, missing fields, over-discounted order |
| `401` | Unauthorized | Missing/invalid JWT cookie; also returned when merchant accesses admin routes (role mismatch at middleware level) |
| `403` | Forbidden | Authenticated but wrong role (e.g. customer accessing `/api/merchant/dashboard`) |
| `404` | Not Found | Order ID or product ID doesn't exist |
| `500` | Internal Server Error | Unexpected server failure |

## API Versioning

Phase 1 uses a single versioned surface at `/api/`. Future phases may add `/api/v1/` prefix or break changes. For now, all endpoints are stable under the root `/api/` path.

## Client Integration Notes

- The frontend should read the `growthos_token` cookie via `document.cookie` or the `Next.js `headers` `response` and send it as a cookie on each request (Next.js App Router does this automatically for pages under `_app.tsx`).
- For Axios/fetch: include `credentials: 'include'` to send cookies cross-origin, or read `document.cookie` and pass as `Cookie: growthos_token=...` header.
- The `jose` library can verify tokens on the client if needed, but the recommended pattern is: rely on the middleware for auth checks and only use the `me` endpoint to determine the current role in UI.