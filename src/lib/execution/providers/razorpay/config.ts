export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: "test" | "live";
}

export function getRazorpayConfig(): RazorpayConfig {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const mode = (process.env.RAZORPAY_MODE as "test" | "live") || "test";

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required");
  }

  return { keyId, keySecret, webhookSecret, mode };
}

export function isLiveMode(): boolean {
  return getRazorpayConfig().mode === "live";
}

export function validateAmount(amountMinor: number): void {
  if (typeof amountMinor !== "number" || !Number.isInteger(amountMinor)) {
    throw new Error("amountMinor must be an integer");
  }
  if (amountMinor <= 0) {
    throw new Error("amountMinor must be positive");
  }
  if (amountMinor > 100000000) {
    throw new Error("amountMinor exceeds maximum allowed (100000000)");
  }
}

export function validateCurrency(currency: string): void {
  if (currency !== "INR") {
    throw new Error(`Unsupported currency: ${currency}. Only INR is supported.`);
  }
}
