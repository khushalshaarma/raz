export type UserRole = "MERCHANT" | "CUSTOMER" | "ADMIN";

export type MerchantStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";

export type OrderStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export type PaymentStatus = "CREATED" | "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED" | "UNKNOWN";

export type CampaignStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";

export type OpportunityType = "INACTIVE_CUSTOMERS" | "CART_ABANDONMENT" | "UPSELL" | "CROSS_SELL" | "LOW_CONVERSION" | "PAYMENT_RECOVERY" | "HIGH_VALUE_CUSTOMER";

export type OpportunityStatus = "DETECTED" | "REVIEWING" | "ACTIONED" | "DISMISSED" | "EXPIRED";

export type AgentType = "OPPORTUNITY" | "STRATEGY" | "SIMULATION" | "DECISION" | "EXECUTION" | "SECURITY" | "RELIABILITY" | "RECONCILIATION" | "LEARNING";

export type AgentStatus = "ACTIVE" | "PAUSED" | "DISABLED";

export type AuditActorType = "USER" | "MERCHANT" | "CUSTOMER" | "ADMIN" | "AGENT" | "SYSTEM";

export type AuditSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type AuditAction =
  | "USER_LOGIN"
  | "USER_REGISTER"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "PAYMENT_CREATED"
  | "PAYMENT_UPDATED"
  | "OPPORTUNITY_CREATED"
  | "OPPORTUNITY_UPDATED"
  | "CAMPAIGN_CREATED"
  | "CAMPAIGN_UPDATED"
  | "AGENT_CREATED"
  | "SYSTEM_HEALTH_CHECK";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface Merchant {
  id: string;
  ownerId: string;
  businessName: string;
  email: string;
  currency: string;
  timezone: string;
  status: MerchantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  merchantId: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  merchantId: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  sku: string;
  category: string;
  stock: number;
  imageUrl: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  merchantId: string;
  customerId: string;
  status: OrderStatus;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  merchantId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Campaign {
  id: string;
  merchantId: string;
  name: string;
  status: CampaignStatus;
  targetAudience: string | null;
  budgetMinor: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Opportunity {
  id: string;
  merchantId: string;
  title: string;
  description: string;
  type: OpportunityType;
  estimatedRevenueMinor: number;
  confidence: number;
  status: OpportunityStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  merchantId: string | null;
  name: string;
  type: AgentType;
  status: AgentStatus;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEvent {
  id: string;
  merchantId: string | null;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: string | null;
  severity: AuditSeverity;
  timestamp: Date;
}

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  conversionRate: number;
}
