# Phase 4 Audit System

## Purpose

The audit system provides an immutable, append-only trail of all governance decisions, approvals, rejections, and administrative actions. Every action that affects the governance state creates an `AuditLog` record, enabling full traceability and accountability.

## AuditLog Model (Prisma)

```prisma
model AuditLog {
  id               String   @id @default(uuid())
  merchantId       String?  // null for system events
  action           String
  resourceType     String // ACTION_REQUEST | POLICY | GOVERNANCE_DECISION | SIMULATION | OPPORTUNITY | STRATEGY
  resourceId       String
  outcome          String // ALLOWED | BLOCKED | APPROVED | EXECUTED | EXPIRED
  details          String?  // JSON
  severity         String   @default("INFO") // INFO | WARNING | ERROR | CRITICAL
  createdAt        DateTime @default(now())

  merchant Merchant? @relation(fields: [merchantId], references: [id])
}
```

## When Records Are Created

### 1. Governance Decision (Step 18 of orchestrator)
Created by `governance.ts` after Step 16 produces a final decision:
```typescript
await prisma.auditLog.create({
  data: {
    merchantId: authenticatedMerchantId,
    action: `GOVERNANCE_${finalDecision}`,    // e.g., GOVERNANCE_BLOCKED, GOVERNANCE_APPROVED
    resourceType: "GOVERNANCE_DECISION",
    resourceId: governanceDecision.id,
    outcome: finalDecision,                    // BLOCKED, REQUIRE_APPROVAL, APPROVED
    details: JSON.stringify({ reasonCodes, decisionReason, securityScore }),
    severity: finalDecision === "BLOCKED" ? "CRITICAL" : "INFO",
  },
});
```

### 2. Approval Approved
Created by `approvals/[id]/approve/route.ts`:
```typescript
await prisma.auditLog.create({
  data: {
    merchantId: decision.merchantId,
    action: "APPROVAL_APPROVED",
    resourceType: "GOVERNANCE_DECISION",
    resourceId: params.id,
    outcome: "APPROVED",
    details: JSON.stringify({ approvedBy: userId }),
    severity: "INFO",
  },
});
```

### 3. Approval Rejected
Created by `approvals/[id]/reject/route.ts`:
```typescript
await prisma.auditLog.create({
  data: {
    merchantId: decision.merchantId,
    action: "APPROVAL_REJECTED",
    resourceType: "GOVERNANCE_DECISION",
    resourceId: params.id,
    outcome: "BLOCKED",
    details: JSON.stringify({ rejectedBy: userId }),
    severity: "WARNING",
  },
});
```

### 4. Emergency Stop Enabled
Created by `emergency-stop.ts`:
```typescript
await prisma.auditLog.create({
  data: {
    action: "EMERGENCY_STOP_ENABLED",
    resourceType: "GOVERNANCE",
    resourceId: adminId,
    outcome: "BLOCKED",
    details: JSON.stringify({ reason, enabledBy: adminId }),
    severity: "CRITICAL",
  },
});
```

### 5. Emergency Stop Disabled
Created by `emergency-stop.ts`:
```typescript
await prisma.auditLog.create({
  data: {
    action: "EMERGENCY_STOP_DISABLED",
    resourceType: "GOVERNANCE",
    resourceId: adminId,
    outcome: "ALLOWED",
    details: JSON.stringify({ disabledBy: adminId }),
    severity: "INFO",
  },
});
```

## Immutable Append-Only

- AuditLog records are **never updated or deleted** — only created via `prisma.auditLog.create()`
- The `createdAt` field defaults to `now()` and is not mutable
- No update or delete operations exist on the `AuditLog` model in the codebase
- Records are ordered by `createdAt` descending when queried

## Severity Levels

| Level | Usage |
|-------|-------|
| `INFO` | Normal approvals, emergency stop disabled, successful governance decisions |
| `WARNING` | Approval rejections |
| `ERROR` | Not used in governance (defined in schema) |
| `CRITICAL` | Blocked governance decisions, emergency stop enabled |

## Data Isolation

- `merchantId` is optional (`String?`) — `null` for system events like emergency stop
- When querying audit logs, `merchantId` is used to filter:
  - Admin security dashboard: `prisma.auditLog.findMany({ where: { severity: "CRITICAL", ...(merchantId ? { merchantId } : {}) } })`
  - Governance orchestrator: Creates records with the authenticated `merchantId`
- System-level events (emergency stop) have `merchantId: undefined`
- The `AuditLog` model has a `merchant` relation, allowing joins

## Admin Security Dashboard Queries

The `GET /api/admin/security` route queries AuditLog for:
1. **Security violations**: `severity: "CRITICAL"` records
2. **Velocity violations**: `action: { contains: "VELOCITY" }` records
3. **Blocked actions**: Via `ActionRequest` model (status: "BLOCKED")
4. **Emergency stop status**: Via `SystemHealth` model (`application: "ok"`)

All queries support optional `merchantId` filtering.

## Tests

**No dedicated tests exist for the audit system.** The 53 project-wide tests do not cover audit log behavior. There are no unit tests for audit log creation or querying.
