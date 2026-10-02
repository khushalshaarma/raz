export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  return { valid: errors.length === 0, errors };
}

export function validatePrice(price: number): boolean {
  return Number.isInteger(price) && price > 0;
}

export function validateCurrency(currency: string): boolean {
  const valid = ["INR", "USD", "EUR", "GBP"];
  return valid.includes(currency);
}

export function validateRole(role: string): role is "MERCHANT" | "CUSTOMER" | "ADMIN" {
  return ["MERCHANT", "CUSTOMER", "ADMIN"].includes(role);
}

export function validateOrderStatus(status: string): boolean {
  return ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].includes(status);
}

export function validatePaymentStatus(status: string): boolean {
  return ["CREATED", "PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "UNKNOWN"].includes(status);
}

export function validateProductStatus(status: string): boolean {
  return ["DRAFT", "ACTIVE", "ARCHIVED"].includes(status);
}

export function validateOpportunityType(type: string): boolean {
  return [
    "INACTIVE_CUSTOMERS", "CART_ABANDONMENT", "UPSELL", "CROSS_SELL",
    "LOW_CONVERSION", "PAYMENT_RECOVERY", "HIGH_VALUE_CUSTOMER"
  ].includes(type);
}

export function validateOpportunityStatus(status: string): boolean {
  return ["DETECTED", "REVIEWING", "ACTIONED", "DISMISSED", "EXPIRED"].includes(status);
}

export function validateCampaignStatus(status: string): boolean {
  return ["DRAFT", "PENDING_APPROVAL", "APPROVED", "RUNNING", "PAUSED", "COMPLETED", "FAILED"].includes(status);
}

export function validateAgentType(type: string): boolean {
  return [
    "OPPORTUNITY", "STRATEGY", "SIMULATION", "DECISION", "EXECUTION",
    "SECURITY", "RELIABILITY", "RECONCILIATION", "LEARNING"
  ].includes(type);
}

export function validateAgentStatus(status: string): boolean {
  return ["ACTIVE", "PAUSED", "DISABLED"].includes(status);
}
