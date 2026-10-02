# GrowthOS Phase 1 Data Model

## Overview

All data models are defined in `prisma/schema.prisma` and represented as TypeScript types in `src/types/index.md`. The model uses integer minor units for all monetary amounts to avoid floating-point arithmetic.

## Core Models

### User

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique user identifier |
| `email` | `String` @unique | Login email address |
| `password` | `String` | Hashed password (bcrypt, 12 rounds) |
| `name` | `String` | Full user name |
| `role` | `String` @default("CUSTOMER") | MERCHANT \| CUSTOMER \| ADMIN |
| `createdAt` | `DateTime` @default(now()) | Account creation timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last update timestamp |
| `merchant` | `Merchant?` | Optional: user is an owner of this merchant |
| `customer` | `Customer?` | Optional: user has a customer profile |
| `auditLogs` | `AuditEvent[]` | Events where this user is the actor |

### Merchant

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique merchant identifier |
| `ownerId` | `String` @unique | FK → User.id (the merchant owner) |
| `businessName` | `String` | Legal/trade name of the business |
| `email` | `String` | Contact email |
| `currency` | `String` @default("INR") | Currency code: INR, USD, EUR, GBP |
| `timezone` | `String` @default("Asia/Kolkata") | IANA timezone identifier |
| `status` | `String` @default("ACTIVE") | ACTIVE \| SUSPENDED \| INACTIVE |
| `createdAt` | `DateTime` @default(now()) | Merchant onboarding timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last status/ config update |
| `owner` | `User` @relation(fields: [ownerId], references: [id]) | The owning user |
| `customers` | `Customer[]` | Customers belonging to this merchant |
| `products` | `Product[]` | Products listed by this merchant |
| `orders` | `Order[]` | Orders placed through this merchant |
| `payments` | `Payment[]` | Payments received for this merchant's orders |
| `campaigns` | `Campaign[]` | Marketing campaigns for this merchant |
| `opportunities` | `Opportunity[]` | Detected business opportunities |
| `agents` | `Agent[]` | System/merchant AI agents |
| `auditLogs` | `AuditEvent[]` | Events originating from this merchant |

### Customer

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique customer identifier |
| `merchantId` | `String` | FK → Merchant.id (the merchant this customer belongs to) |
| `userId` | `String?` @unique | FK → User.id (nullable for guest customers) |
| `name` | `String` | Customer's full name |
| `email` | `String` | Customer email address |
| `phone` | `String?` | Optional phone number |
| `createdAt` | `DateTime` @default(now()) | Account creation timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last update timestamp |
| `merchant` | `Merchant` @relation(fields: [merchantId], references: [id]) | The merchant this customer belongs to |
| `user` | `User?` @relation(fields: [userId], references: [id]) | The auth user if this is a registered account |
| `orders` | `Order[]` | Orders placed by this customer |

**Unique constraint**: `@unique([merchantId, email])` — a customer email is unique within a single merchant.

### Product

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique product identifier |
| `merchantId` | `String` | FK → Merchant.id |
| `name` | `String` | Product name |
| `description` | `String` | Free-text description |
| `priceMinor` | `Int` | **Price in minor currency units** (paise for INR). e.g. `499900` = ₹4,999.00. Never uses floating point. |
| `currency` | `String` @default("INR") | Must be one of: INR, USD, EUR, GBPT |
| `sku` | `String` | Stock Keeping Unit — must be unique per merchant |
| `category` | `String` | e.g. Footwear, Apparel, Accessories |
| `stock` | `Int` @default(0) | Inventory count |
| `imageUrl` | `String?` | Optional URL to product image |
| `active` | `Boolean` @default(true) | Whether the product is listed/available |
| `createdAt` | `DateTime` @default(now()) | Product creation timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last update timestamp |
| `merchant` | `Merchant` @relation(fields: [merchantId], references: [id]) | The merchant owning this product |
| `orderItems` | `OrderItem[]` | Line items in orders containing this product |

**Unique constraint**: `@unique([merchantId, sku])` — no two products share the same SKU within a merchant.

### Order

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique order identifier |
| `merchantId` | `String` | FK → Merchant.id |
| `customerId` | `String` | FK → Customer.id |
| `status` | `String` @default("PENDING") | PENDING \| CONFIRMED \| CANCELLED \| COMPLETED |
| `currency` | `String` @default("INR") | Currency code |
| `subtotalMinor` | `Int` | Sum of item prices before discount (paise) |
| `discountMinor` | `Int` @default(0) | Discount amount (paise) |
| `totalMinor` | `Int` | final amount = subtotal - discount (paise) |
| `createdAt` | `DateTime` @default(now()) | Order placement timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last status update |
| `merchant` | `Merchant` @relation(fields: [merchantId], references: [id]) | The selling merchant |
| `customer` | `Customer` @relation(fields: [customerId], references: [id]) | The buying customer |
| `items` | `OrderItem[]` | Ordered line items |
| `payments` | `Payment[]` | Payments associated with this order |

### Payment (Foundation Only)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique payment identifier |
| `merchantId` | `String` | FK → Merchant.id |
| `orderId` | `String` | FK → Order.id (nullable if payment is unattached) |
| `amountMinor` | `Int` | Amount in minor currency units (paise) |
| `currency` | `String` @default("INR") | Currency code |
| `status` | `String` @default("CREATED") | CREATED \| PENDING \| AUTHORIZED \| CAPTURED \| FAILED \| REFUNDED \| UNKNOWN |
| `provider` | `String` @default("razorpay") | Payment provider name |
| `providerPaymentId` | `String?` | External provider's payment ID (e.g. Razorpay `rzp_...`) |
| `createdAt` | `DateTime` @default(now()) | Payment creation timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last status update |
| `merchant` | `Merchant` @relation(fields: [merchantId], references: [id]) | The merchant receiving funds |
| `order` | `Order?` @relation(fields: [orderId], references: [id]) | The associated order |

**Initial statuses**: CREATED → PENDING → AUTHORIZED → CAPTURED → FAILED / REFUNDED / UNKNOWN

### Campaign (Foundation Only)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique campaign identifier |
| `merchantId` | `String` | FK → Merchant.id |
| `name` | `String` | Campaign display name |
| `status` | `String` @default("DRAFT") | DRAFT \| PENDING_APPROVAL \| APPROVED \| RUNNING \| PAUSED \| COMPLETED \| FAILED |
| `targetAudience` | `String?` | e.g. ALL_CUSTOMERS, INACTIVE_CUSTOMERS, ACTIVE_BUYERS |
| `budgetMinor` | `Int?` | Total budget in minor currency units |
| `createdAt` | `DateTime` @default(now()) | Campaign creation timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last status update |
| `merchant` | `Merchant` @relation(fields: [merchantId], references: [id]) | The owner merchant |

### Opportunity (Foundation Only)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique opportunity identifier |
| `merchantId` | `String` | FK → Merchant.id |
| `title` | `String` | Human-readable opportunity title |
| `description` | `String` | Free-text description |
| `type` | `String` | INACTIVE_CUSTOMERS \| CART_ABANDONMENT \| UPSELL \| CROSS_SELL \| LOW_CONVERSION \| PAYMENT_RECOVERY \| HIGH_VALUE_CUSTOMER |
| `estimatedRevenueMinor` | `Int` | Estimated revenue impact if actioned (paise) |
| `confidence` | `Float` @default(0) | Confidence score 0.0–1.0 (e.g. 0.84 = 84%) |
| `status` | `String` @default("DETECTED") | DETECTED \| REVIEWING \| ACTIONED \| DISMISSED \| EXPIRED |
| `createdAt` | `DateTime` @default(now()) | Opportunity detection timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last status update |
| `merchant` | `Merchant` @relation(fields: [merchantId], references: [id]) | The merchant this opportunity belongs to |

**Opportunity types**: INACTIVE_CUSTOMERS, CART_ABANDONMENT, UPSELL, CROSS_SELL, LOW_CONVERSION, PAYMENT_RECOVERY, HIGH_VALUE_CUSTOMER

### Agent (Foundation Only)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique agent identifier |
| `merchantId` | `String?` | FK → Merchant.id (nullable for system agents) |
| `name` | `String` | Agent display name |
| `type` | `String` | OPPORTUNITY \| STRATEGY \| SIMULATION \| DECISION \| EXECUTION \| SECURITY \| RELIABILITY \| RECONCILIATION \| LEARNING |
| `status` | `String` @default("ACTIVE") | ACTIVE \| PAUSED \| DISABLED |
| `description` | `String?` | Free-text description of agent purpose |
| `createdAt` | `DateTime` @default(now()) | Agent creation timestamp |
| `updatedAt` | `DateTime` @updatedAt | Last status update |
| `merchant` | `Merchant?` @relation(fields: [merchantId], references: [id]) | The owning merchant (null = system agent) |

**Initial agent types**: OPPORTUNITY, STRATEGY, SIMULATION, DECISION, EXECUTION, SECURITY, RELIABILITY, RECONCILIATION, LEARNING

**Initial statuses**: ACTIVE, PAUSED, DISABLED

### AuditEvent (Foundation Only)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique audit event identifier |
| `merchantId` | `String?` | FK → Merchant.id (nullable for system events) |
| `actorType` | `String` | USER \| MERCHANT \| CUSTOMER \| ADMIN \| AGENT \| SYSTEM |
| `actorId` | `String?` | ID of the user/merchant/customer/admin/agent who caused the event |
| `action` | `String` | The action that was performed (e.g. USER_LOGIN, PRODUCT_CREATED, ORDER_CREATED) |
| `resourceType` | `String?` | The resource type affected (e.g. Product, Order, Campaign) |
| `resourceId` | `String?` | The specific resource ID affected |
| `metadata` | `String?` | JSON string for flexible extra data |
| `severity` | `String` @default("INFO") | INFO \| WARNING \| ERROR \| CRITICAL |
| `timestamp` | `DateTime` @default(now()) | Event timestamp |
| `merchant` | `Merchant?` @relation(fields: [merchantId], references: [id]) | The merchant context (null = system event) |
| `actor` | `User?` @relation("ActorUser", fields: [actorId], references: [id]) | The user who caused the event (if actorType = USER) |

**Example events**: USER_LOGIN, PRODUCT_CREATED, ORDER_CREATED, OPPORTUNITY_CREATED, CAMPAIGN_CREATED, SYSTEM_HEALTH_CHECK

### SystemHealth

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` @id @default(uuid()) | Unique health record identifier |
| `application` | `String` @default("ok") | Application status: ok, degraded, down |
| `api` | `String` @default("ok") | API status: ok, degraded, down |
| `database` | `String` @default("ok") | Database status: ok, degraded, down |
| `environment` | `String` @default("development") | development, staging, production |
| `lastCheckedAt` | `DateTime` @default(now()) | When the health check was performed |

## Money Handling

**All monetary values use integer minor units** (paise for INR, cents for USD, etc.):

- `priceMinor = 499900` represents `₹4,999.00` (never `4999.00` as a float)
- `totalMinor`, `subtotalMinor`, `discountMinor`, `amountMinor`, `budgetMinor`, `estimatedRevenueMinor` all follow this convention
- **Never** use JavaScript `Number` or `float` for monetary arithmetic in business logic
- **Prefer**: `priceMinor = 499900` over `price = 4999.00`
- **Documented approach**: "Prefer integer minor units for all financial amounts if the backend/database architecture supports integer minor units."

## Merchant Data Isolation

**Every merchant-owned entity carries a `merchantId` field**. The Prisma schema enforces:

- `Product.merchantId` → FK → Merchant.id
- `Order.merchantId` → FK → Merchant.id
- `Customer.merchantId` → FK → Merchant.id
- `Payment.merchantId` → FK → Merchant.id
- `Campaign.merchantId` → FK → Merchant.id
- `Opportunity.merchantId` → FK → Merchant.id
- `Agent.merchantId` → FK → Merchant.id (nullable for system agents)
- `AuditEvent.merchantId` → FK → Merchant.id (nullable for system events)

**Critical isolation rule**: Merchant A **must never** access Merchant B's customers, products, orders, payments, campaigns, opportunities, or audit records. The API route handlers all scope queries by `user.merchantId` (extracted from the verified JWT). The middleware enforces role prefixes (`/api/merchant` for merchants, `/api/customer` for customers) so a merchant's API token cannot be used to reach customer or admin endpoints.

**Example**: `GET /api/merchant/products` queries `prisma.product.findMany({ where: { merchantId } })` where `merchantId` comes from the authenticated user. A merchant token cannot be used to query `/api/merchant/products?merchantId=other_merchant_id`.

## Type Definitions

All models are fully typed in `src/types/index.ts`:

```typescript
export interface User { id: string; email: string; name: string; role: UserRole; createdAt: Date; updatedAt: Date; }
export interface Merchant { id: string; ownerId: string; businessName: string; email: string; currency: string; timezone: string; status: MerchantStatus; createdAt: Date; updatedAt: Date; }
export interface Customer { id: string; merchantId: string; userId: string | null; name: string; email: string; phone: string | null; createdAt: Date; updatedAt: Date; }
export interface Product { id: string; merchantId: string; name: string; description: string; priceMinor: number; currency: string; sku: string; category: string; stock: number; imageUrl: string | null; active: boolean; createdAt: Date; updatedAt: Date; }
export interface Order { id: string; merchantId: string; customerId: string; status: OrderStatus; currency: string; subtotalMinor: number; discountMinor: number; totalMinor: number; createdAt: Date; updatedAt: Date; }
export interface Payment { id: string; merchantId: string; orderId: string; amountMinor: number; currency: string; status: PaymentStatus; provider: string; providerPaymentId: string | null; createdAt: Date; updatedAt: Date; }
export interface Campaign { id: string; merchantId: string; name: string; status: CampaignStatus; targetAudience: string | null; budgetMinor: number | null; createdAt: Date; updatedAt: Date; }
export interface Opportunity { id: string; merchantId: string; title: string; description: string; type: OpportunityType; estimatedRevenueMinor: number; confidence: number; status: OpportunityStatus; createdAt: Date; updatedAt: Date; }
export interface Agent { id: string; merchantId: string | null; name: string; type: AgentType; status: AgentStatus; description: string | null; createdAt: Date; updatedAt: Date; }
export interface AuditEvent { id: string; merchantId: string | null; actorType: AuditActorType; actorId: string | null; action: string; resourceType: string | null; resourceId: string | null; metadata: string | null; severity: AuditSeverity; timestamp: Date; }
export interface DashboardStats { totalRevenue: number; totalOrders: number; totalCustomers: number; conversionRate: number; }
```

## Enum Definitions

| Category | Values |
|----------|--------|
| `UserRole` | `MERCHANT` \| `CUSTOMER` \| `ADMIN` |
| `MerchantStatus` | `ACTIVE` \| `SUSPENDED` \| `INACTIVE` |
| `OrderStatus` | `PENDING` \| `CONFIRMED` \| `CANCELLED` \| `COMPLETED` |
| `PaymentStatus` | `CREATED` \| `PENDING` \| `AUTHORIZED` \| `CAPTURED` \| `FAILED` \| `REFUNDED` \| `UNKNOWN` |
| `CampaignStatus` | `DRAFT` \| `PENDING_APPROVAL` \| `APPROVED` \| `RUNNING` \| `PAUSED` \| `COMPLETED` \| `FAILED` |
| `OpportunityType` | `INACTIVE_CUSTOMERS` \| `CART_ABANDONMENT` \| `UPSELL` \| `CROSS_SELL` \| `LOW_CONVERSION` \| `PAYMENT_RECOVERY` \| `HIGH_VALUE_CUSTOMER` |
| `OpportunityStatus` | `DETECTED` \| `REVIEWING` \| `ACTIONED` \| `DISMISSED` \| `EXPIRED` |
| `AgentType` | `OPPORTUNITY` \| `STRATEGY` \| `SIMULATION` \| `DECISION` \| `EXECUTION` \| `SECURITY` \| `RELIABILITY` \| `RECONCILIATION` \| `LEARNING` |
| `AgentStatus` | `ACTIVE` \| `PAUSED` \| `DISABLED` |
| `AuditActorType` | `USER` \| `MERCHANT` \| `CUSTOMER` \| `ADMIN` \| `AGENT` \| `SYSTEM` |
| `AuditSeverity` | `INFO` \| `WARNING` \| `ERROR` \| `CRITICAL` |

## Seed Data (UrbanWear Merchant)

The seed script creates realistic synthetic data for one demo merchant:

- **1 merchant**: UrbanWear (business name, INR, Asia/Kolkata, ACTIVE)
- **1 merchant owner**: Arjun Mehta (user, Password123)
- **20 customers**: Riya Kapoor, Aarav Patel, Sneha Gupta, etc. (phones +91xxxxxxxxxx, each tied to UrbanWear or TechStore)
- **30 products** (UrbanWear): Running Shoes ₹4,999, Performance Tee ₹899, Jeans ₹1,999, Jacket ₹2,499, Sports Watch ₹3,499, Backpack ₹1,499, plus 23 more variants
- **35 orders**: Mix of COMPLETED (24), PENDING (6), CONFIRMED (4), CANCELLED (1), across 10 customers, total revenue ~₹7,976
- **3 campaigns**: Independence Day Sale (COMPLETED), Monsoon Collection Launch (RUNNING), Win-Back Inactive Customers (DRAFT)
- **3 opportunities**: Inactive high-value customers (₹2.1L potential, 84% confidence), Cart abandonment recovery, Upsell premium sneakers
- **5 agents**: Opportunity Scanner (ACTIVE), Strategy Planner (ACTIVE), Decision Engine (ACTIVE), Security Monitor (ACTIVE), Performance Sim (PAUSED)
- **5 audit events**: USER_LOGIN (merchant), AGENT_OPPORTUNITY_CREATED, SYSTEM_HEALTH_CHECK, CAMPAIGN_CREATED, PRODUCT_CREATED
- **System health**: application/Api/Database all "ok", environment "development"

All synthetic data is explicitly marked as **SIMULATION / TEST DATA** and never presented as real-world merchant performance.

## Database Schema Diagram (conceptual)

```
User {1}--{1} Merchant (via ownerId)
Merchant {1}--{1} Customer (via merchantId)
Merchant {1}--{1} Product (via merchantId)
Merchant {1}--{1} Order (via merchantId)
Customer {1}--{1} Order (via customerId)
Order {1}--* OrderItem (via orderId)
OrderItem {1}--1 Product (via productId)
Order {1}--* Payment (via orderId)
Merchant {1}--* Campaign (via merchantId)
Merchant {1}--* Opportunity (via merchantId)
Merchant {1}--* Agent (via merchantId, optional)
Merchant {1}--* AuditEvent (via merchantId, optional)
SystemHealth (singleton-like, no relations)
```