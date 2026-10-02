import crypto from "crypto";

export function verifyRazorpayWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export function generateRazorpaySignature(
  body: string,
  secret: string
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
}
