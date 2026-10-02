# GrowthOS Phase 10 — Transaction Safety

## Pattern
All multi-step DB operations use `prisma.$transaction()`:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.modelA.create({ ... });
  await tx.modelB.update({ ... });
  await tx.modelC.create({ ... });
});
```
On failure: full rollback. No partial business state.

## Transaction Map

### 1. Simulation → Decision (simulation-center.ts)
**Before**: Simulation + Scenarios + Decision created independently
**After**: Atomic via `$transaction`
**Risk eliminated**: Partial simulation state on failure

### 2. Governance Decision + Audit (governance.ts)
**Before**: GovernanceDecision.create then AuditLog.create (separate)
**After**: Atomic via `$transaction`
**Risk eliminated**: Governance decision without audit trail

### 3. Approval (approve/route.ts)
**Before**: GovernanceDecision.update then AuditLog.create (separate)
**After**: Atomic via `$transaction` with `updateMany` status guard
**Risk eliminated**: Approved UI but DB still pending; double-approval

### 4. Rejection (reject/route.ts)
**Before**: GovernanceDecision.update then AuditLog.create (separate)
**After**: Atomic via `$transaction` with `updateMany` status guard
**Risk eliminated**: Rejected UI but DB still pending

### 5. Webhook Payment (razorpay/route.ts)
**Before**: Execution update + GovernanceDecision update + ActionRequest update + AuditLog (4 separate)
**After**: Atomic via `$transaction`
**Risk eliminated**: Stale governance state after payment

## Concurrency Protection
Approval/rejection use `updateMany` with status condition:
```typescript
const updated = await tx.governanceDecision.updateMany({
  where: { id, status: "PENDING" },
  data: { status: "APPROVED" },
});
if (updated.count === 0) throw new Error("Already processed");
```
Prevents race conditions from concurrent approval requests.

## Error Semantics
- Transaction failure → operation fails
- Error propagated to caller
- No partial state persisted
- Existing error handling preserved
