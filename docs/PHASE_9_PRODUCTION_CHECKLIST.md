# GrowthOS Phase 9 — Production Checklist

## Pre-Deployment Verification

### TypeScript
- [x] `npx tsc --noEmit` — zero errors
- [x] All type imports resolved
- [x] No `any` types in critical paths

### ESLint
- [x] `npm run lint` — zero warnings/errors
- [x] No unused imports
- [x] Consistent code style

### Tests
- [x] 382 tests passing across 45 files
- [x] Governance: fail-closed verified
- [x] Kill switch: fail-closed verified
- [x] Emergency stop: fail-closed verified
- [x] Merchant isolation verified
- [x] E2E agentic cycle verified

### Build
- [x] `npm run build` — succeeds
- [x] No build warnings
- [x] All pages compile

## Security Checklist

### Authentication
- [ ] JWT secret set via `GROWTHOS_JWT_SECRET` env var (NOT hardcoded fallback)
- [ ] Token expiry configured appropriately
- [ ] Cookie flags: `httpOnly: true`, `secure: true`, `sameSite: 'strict'`

### Authorization
- [ ] Middleware enforces role-based access
- [ ] Customer routes isolated from merchant routes
- [ ] Admin routes restricted to ADMIN role

### Data Isolation
- [ ] All API queries include merchantId filter
- [ ] Cross-merchant access blocked at API level
- [ ] Customer data never leaks between merchants

### Webhook Security
- [ ] Razorpay signature verification enabled
- [ ] Webhook endpoint rate-limited
- [ ] Webhook events logged to AuditEvent

### Financial Safety
- [ ] All monetary values stored as Int (paise)
- [ ] No floating-point arithmetic on stored values
- [ ] Display formatting only uses paise/100

## Governance Checklist

### Fail-Closed
- [x] Governance throws on persistence failure
- [x] Kill switch defaults to PAUSED on error
- [x] Emergency stop defaults to ENABLED on error
- [ ] All critical failures block, never allow (verified in tests)

### Approval Chain
- [ ] 4-eyes pattern enforced for high-value actions
- [ ] Approval records persisted to GovernanceDecision
- [ ] Rejection reason recorded

### Monitoring
- [ ] AuditEvent records created for all state changes
- [ ] SystemHealth tracks component status
- [ ] AgentEvent records capture agent activity

## Integration Checklist

### Data Flow
- [x] Opportunity → Strategy linked (POST endpoint)
- [x] Simulation → Decision linked (auto-creation)
- [x] Webhook → Governance status updated
- [x] formatMoney consolidated (single source of truth)
- [x] Governance persistence errors throw (not swallowed)
- [x] Kill switch/emergency stop fail-closed

### Remaining Gaps (Phase 10)
- [ ] GAP 5: Add Prisma `$transaction()` for multi-step operations
- [ ] GAP 8: Wire confidence/risk analysis into governance pipeline

## Performance

### Database
- [ ] Indexes on frequently queried fields
- [ ] Connection pooling configured
- [ ] SQLite WAL mode enabled (for dev)

### API
- [ ] Response times < 200ms for standard queries
- [ ] Pagination implemented for list endpoints
- [ ] Rate limiting configured

### Frontend
- [ ] Initial load < 3s
- [ ] No layout shift
- [ ] Loading states for async operations

## Deployment

### Environment Variables
```
GROWTHOS_JWT_SECRET=<strong-random-secret>
DATABASE_URL=file:./dev.db
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

### Database Migration
```bash
npx prisma migrate deploy
npx prisma generate
```

### Start
```bash
npm run build
npm start
```

## Post-Deployment

### Verification
- [ ] Login works for all roles (MERCHANT, CUSTOMER, ADMIN)
- [ ] Opportunity list loads with real data
- [ ] Strategy generation creates records
- [ ] Simulation runs produce scenarios
- [ ] Governance evaluation blocks/allows correctly
- [ ] Approval workflow completes
- [ ] Execution records created
- [ ] Webhooks update execution status
- [ ] Reconciliation detects mismatches
- [ ] Audit trail captures all events

### Monitoring
- [ ] SystemHealth endpoint returns component status
- [ ] Error rates within acceptable limits
- [ ] No database connection issues
- [ ] Webhook processing latency acceptable

### Rollback
- [ ] Database backup before migration
- [ ] Previous build artifact available
- [ ] Feature flags for new functionality (if applicable)
