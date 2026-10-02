export interface MoneyValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMoneyAmount(amountMinor: unknown): MoneyValidationResult {
  if (typeof amountMinor !== "number") {
    return { valid: false, error: "amountMinor must be a number" };
  }

  if (!Number.isFinite(amountMinor)) {
    return { valid: false, error: "amountMinor must be finite (no NaN or Infinity)" };
  }

  if (!Number.isInteger(amountMinor)) {
    return { valid: false, error: "amountMinor must be an integer" };
  }

  if (amountMinor <= 0) {
    return { valid: false, error: "amountMinor must be positive" };
  }

  if (amountMinor > 999999999) {
    return { valid: false, error: "amountMinor exceeds maximum allowed value" };
  }

  return { valid: true };
}

export function isValidCurrency(currency: string): boolean {
  const validCurrencies = ["INR", "USD", "EUR", "GBP"];
  return validCurrencies.includes(currency);
}

export function formatMoneyMinor(amountMinor: number, currency: string = "INR"): string {
  const divisor = 100;
  const amount = amountMinor / divisor;
  const symbols: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
  return `${symbols[currency] ?? ""}${amount.toFixed(2)}`;
}
