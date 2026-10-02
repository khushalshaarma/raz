import Razorpay from "razorpay";
import { getRazorpayConfig } from "./config";

let razorpayInstance: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!razorpayInstance) {
    const config = getRazorpayConfig();
    razorpayInstance = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
  }
  return razorpayInstance;
}

export function resetRazorpayClient(): void {
  razorpayInstance = null;
}
