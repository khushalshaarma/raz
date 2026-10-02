# GrowthOS Phase 1 Architecture

## Current Architecture (Inspected)

- **Framework**: Next.js 14+ with App Router (full-stack React + API routes)
- **Backend**: Next.js API routes (single-process, Node.js)
- **Database**: SQLite via Prisma ORM
- **ORM/Query Layer**: Prisma Client
- **Authentication**: JWT-based using `jose` library + `bcryptjs` for password hashing
- **State Management**: React state + URL parameters; Zustand not used (single-app-stack)
- **Styling**: Tailwind CSS with custom `growthos` color palette (calm, minimal, professional)
- **Build System**: `next build` + `npm run dev` (dev), `next start` (production)
- **Testing**: Vitest (unit tests for validations, auth, data models)
- **Environment Configuration**: `.env` files with `JWT_SECRET`, `DATABASE_URL`

## Proposed GrowthOS Architecture

```
Root (single Next.js 14 app)
├── src/app/          ← Pages & Route Handlers (App Router)
│   ├── api/          ← Backend API routes (auth, merchant, customer, admin)
│   │   ├── auth/     ← Register, login, me, logout
│   │   ├── merchant/ ← Dashboard, products, customers, orders,
│   │   │   ├── payments, campaigns, opportunities, agents,
│   │   │   ├── audit, security, reconciliation, settings
│   │   ├── customer/ ← Shop, product detail, orders
│   │   └── admin/    ← Dashboard, merchants, audit, health
│   ├── merchant/     ← Merchant dashboard layout + protected pages
│   ├── customer/     ← Customer shop layout + protected pages
│   └── admin/        ← Admin dashboard layout + protected pages
├── src/components/   ← Reusable UI primitives
│   ├── ui/           ← Card, Button, Badge, LoadingSpinner, ComingSoon
│   ├── merchant/     ← MerchantSidebar, DashboardContent
│   ├── customer/     ← CustomerSidebar, ShopContent
│   └── admin/        ← AdminSidebar, AdminContent
├── src/lib/          ← Core libraries (auth, errors, validations, audit)
│   ├── auth.ts       ← JWT signing/verification, role gating
│   ├── errors.ts     ← AppError, successResponse, forbiddenResponse,
│   │               merchantGuard, authorizeRoutes
│   ├── validations.ts← Input validation for all domain fields
│   └── audit.ts      ← Foundation audit event creation helper
├── src/types/        ← Full TypeScript type definitions for all
│   │   models (User, Merchant, Customer, Product, Order, Payment,
│   │   Campaign, Opportunity, Agent, AuditEvent, SystemHealth,
│   │   DashboardStats, roles, statuses)
├── src/middleware.ts ← Role-based route protection (enforces
│   │   MERCHANT/CUSTOMER/ADMIN prefixes, JWT verification,
│   │   redirects unauthenticated, 403 for wrong role)
├── src/lib/prisma.ts ← Prisma client singleton with dev-mode
│   │ auto-reconnect
├── prisma/           ← Schema + seed data
│   ├── schema.prisma ← All data models (User, Merchant, Customer,
│   │   Product, Order, Payment, Campaign, Opportunity,
│   │   Agent, AuditEvent, SystemHealth)
│   └── seed.ts       ← ~150 synthetic records for UrbanWear merchant
├── docs/             ← Phase 1 documentation
│   ├── PHASE_1_ARCHITECTURE.md   ← This file
│   ├── PHASE_1_DATA_MODEL.md     ← Data model spec
│   ├── PHASE_1_API.md            ← API surface spec
│   └── PHASE_1_STATUS.md         ← Status report (below)
└── tests/            ← Vitest unit test suite
    ├── validations.test.ts   ← 20 validation tests
    ├── auth.test.ts          ← 7 auth library tests
    ├── authorization.test.ts← 14 role-authorization tests
    └── data-model.test.ts    ← 12 financial-integrity tests
```

## Important Existing Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies & scripts (next, react, prisma, bcryptjs, jose, vitest) |
| `tsconfig.json` | TypeScript strict mode, path aliases `@/*` |
| `prisma/schema.prisma` | All data models + relations + multi-tenant isolation |
| `src/middleware.ts` | Role-based protection + auth cookie verification |
| `src/lib/auth.ts` | JWT lifecycle (sign/verify/hash/verify password) |
| `src/lib/validations.ts` | 28 validation helpers for money, passwords, roles, statuses |
| `prisma/seed.ts` | ~150 records: 1 merchant (UrbanWear), 1 owner, 20 customers, 30 products, 30-50 orders, payments, campaigns, opportunities, agents, audit events |
| `src/lib/errors.ts` | Response helpers + merchant/route guards + `authorizeRoutes` |
| `src/types/index.ts` | Complete TypeScript type definitions for all models |

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Added all dependencies (prisma, bcryptjs, jose, vitest, testing deps) |
| `tsconfig.json` | Path aliases `@/*` pointing to `src/*` |
| `tailwind.config.ts` | GrowthOS color palette (bg/surface/border/text/muted/accent) |
| `postcss.config.js` | Tailwind + autoprefixer setup |
| `.gitignore` | Prisma DB files, .next, node_modules, env files |
| `.env` + `.env.example` | JWT_SECRET, DATABASE_URL, app config |
| `next-config.js` | Empty Next.js config (appDir default in v14) |
| `src/app/layout.tsx` | Root layout with metadata, global CSS import |
| `src/app/globals.css` | CSS reset, Tailwind imports, CSS variables for theming |
| `src/app/page.tsx` | Public landing page (landing/redirect to /login) |
| `src/app/login/page.tsx` | Login form (POST → /api/auth/login) |
| `src/app/register/page.tsx` | Register form (POST → /api/auth/register) |
| `src/app/merchant/layout.tsx` | Merchant layout with sidebar + content |
| `src/app/customer/layout.tsx` | Customer layout with sidebar + content |
| `src/app/admin/layout.tsx` | Admin layout with sidebar + content |
| `src/app/api/auth/login/route.ts` | POST login → verify password → sign JWT → set cookie |
| `src/app/api/auth/register/route.ts` | POST register → hash password → create user |
| `src/app/api/auth/me/route.ts` | GET me → return current user from cookie |
| `src/app/api/auth/logout/route.ts` | POST logout → clear cookie |
| All merchant/api/ routes + page components | Full CRUD API + UI pages |
| All customer/api/ routes + page components | Shop, product detail, orders |
| All admin/api/ routes + page components | Dashboard, merchants, audit, health |

## Data Flow

1. **Browser → Next.js App Router**: User navigates to a route (e.g., `/merchant/dashboard`)
2. **Middleware**: Verifies JWT cookie (`growthos_token`), checks role-based prefix
   - Unauthenticated → redirect to `/login`
   - Wrong role → 403 Forbidden
3. **API Route Handler**: Receives verified user payload, scopes queries by `merchantId`
4. **Prisma → SQLite**: Reads/writes to `dev.db` with merchant data isolation
5. **Response**: JSON sent back to client; UI components render with Tailwind styling
6. **Authentication flow**: Login → sets `growthos_token` cookie → middleware verifies →
   routes enforce role gates → API queries scoped by `merchantId`

## Authentication Flow

```
User submits login form → /api/auth/login (POST)
  → Verify bcrypt password match
  → Sign JWT with userId, email, role, merchantId (if merchant)
  → Set HttpOnly cookie: growthos_token (7-day expiry)
  → Redirect to role-appropriate dashboard

Subsequent requests:
  → Middleware reads growthos_token cookie
  → Verifies JWT using jose library
  → Checks role matches route prefix (/merchant, /customer, /admin)
  → Injects user headers (x-user-id, x-user-role, x-merchant-id)
  → Route handler scopes all DB queries by merchantId

Role-gating rules:
  MERCHANT:  /merchant and /api/merchant routes only
  CUSTOMER:  /customer and /api/customer/shop routes only
  ADMIN:     /admin and /api/admin routes only
  Cross-role → 403 Forbidden (handler-level) or 401 (middleware-level)
```

## Role Model

| Role | Can Access | Typical Actions |
|------|-----------|----------------|
| **MERCHANT** | `/merchant/*`, `/api/merchant/*` | View own business data, products, customers, orders, payments, opportunities, campaigns, agents, audit events. Cannot access `/customer/*` or `/admin/*`. |
| **CUSTOMER** | `/customer/*`, `/api/customer/*`, `/api/shop/*` | Browse products, view own orders, view own account. Cannot access `/merchant/*` or `/admin/*`. |
| **ADMIN** | `/admin/*`, `/api/admin/*` | View all merchants, system stats, all audit events, system health. Cannot modify merchant/customer data directly. |

**Authorization enforcement**: Both at the middleware level (prefix + role check) AND at the API handler level (`authorizeRoutes` helper → 401 for missing auth, 403 for wrong role). Never rely on frontend-only UI hiding.

## Known Technical Risks

1. **SQLite doesn't scale to concurrent production traffic** — intended for Phase 1 prototype; PostgreSQL recommended for production
2. **JWT stored in HttpOnly cookie** — no refresh token rotation implemented yet; session fixation risk if cookie not rotated on login
3. **No row-level encryption** — merchantId fields are just strings; a determined actor could craft requests directly
4. **Seed data uses static passwords** (`Password123`) — for demo only; never commit real credentials
5. **No rate limiting** on API endpoints — vulnerable to brute-force; to be added in later phases
6. **Single-process architecture** — Next.js dev/production both run in one process; no worker separation yet

## Files Created

| File | Purpose |
|------|---------|
| `package.json` | Full dependency list and scripts |
| `tsconfig.json` | TypeScript config with path aliases |
| `tailwind.config.ts` | GrowthOS design system colors |
| `postcss.config.js` | Tailwind processing chain |
| `.gitignore` | DB files, caches, env |
| `.env`, `.env.example` | Configuration templates |
| `next-config.js` | Next.js config (appDir default) |
| `src/app/layout.tsx` | Root layout |
| `src/app/globals.css` | Global CSS + CSS variables |
| `src/middleware.ts` | Auth + role-protection middleware |
| `src/lib/auth.ts` | JWT and password handling |
| `src/lib/validations.ts` | 28 field validators |
| `src/lib/errors.ts` | Response helpers + merchant guard + authorizeRoutes |
| `src/types/index.ts` | Full type definitions |
| `src/app/layout.tsx` + all page components | Merchant, customer, admin dashboards |
| All API route handlers | Full CRUD API surface |
| `prisma/schema.prisma` | All 11 data models |
| `prisma/seed.ts` | ~150 synthetic UrbanWear records |
| `tests/validations.test.ts` | 20 validation unit tests |
| `tests/auth.test.ts` | 7 auth library tests |
| `tests/authorization.test.ts` | 14 role-authorization tests |
| `tests/data-model.test.ts` | 12 financial integrity tests |
| `docs/PHASE_1_ARCHITECTURE.md` | This architecture spec |
| `docs/PHASE_1_DATA_MODEL.md` | Data model specification (below) |
| `docs/PHASE_1_API.md` | API surface specification (below) |
| `docs/PHASE_1_STATUS.md` | Status report (below) |

## API Surface Summary

| Category | Endpoints | Auth |
|----------|-----------|------|
| **Auth** | `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/logout` | Public: login/register; Protected: me, logout |
| **Merchant** | `GET/POST /api/merchant/dashboard`, `GET/POST /api/merchant/products`, `GET/POST /api/merchant/customers`, `GET/POST /api/merchant/orders`, `GET/POST /api/merchant/payments`, `GET/POST /api/merchant/campaigns`, `GET/POST /api/merchant/opportunities`, `GET/POST /api/merchant/agents`, `GET/POST /api/merchant/audit`, `GET/POST /api/merchant/security`, `GET/POST /api/merchant/reconciliation`, `GET/POST /api/merchant/settings` | All require MERCHANT role |
| **Customer** | `GET /api/customer/shop`, `GET /api/shop/products`, `GET /api/shop/products/[id]`, `GET /api/customer/orders`, `GET /api/customer/orders/[id]`, `GET /api/customer/me` | All require CUSTOMER role |
| **Admin** | `GET /api/admin/dashboard`, `GET /api/admin/merchants`, `GET /api/admin/audit`, `GET /api/admin/health` | All require ADMIN role |
| **System** | `GET /api/system/health` | Public (no auth required) |

## Build Result

- **Production build**: `next build` → succeeds (EXIT: 0)
- **Development server**: `next dev` → runs at `http://localhost:3000`
- **TypeScript**: `tsc --noEmit` → 0 errors
- **ESLint**: `next lint` → no warnings or errors
- **Vitest**: 53 tests passing across 4 test files

## How To Run

```bash
# Install dependencies
npm install

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Seed the database with synthetic data
npx tsx prisma/seed.ts

# Start development server
npm run dev

# Open browser to http://localhost:3000

# Production build
npm run build
npm run start
```

## Not Implemented Yet (Phase 1 — Foundation Only)

- AI agents, strategy planning, LLM integration
- Razorpay API integration (provider set only in seed simulation data)
- Payment execution, webhooks, reconciliation engine
- AI buyer, fraud detection engine
- Campaign automation, prompt injection protection
- Circuit breakers, advanced payment reliability
- Autonomous financial execution

==================================================
PHASE_1_STATUS.md contents are in the documentation section below.
==================================================