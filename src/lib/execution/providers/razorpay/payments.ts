import { getRazorpayClient } from "./client";

export interface RazorpayPayment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
  description?: string;
  notes?: Record<string, string>;
  created_at: number;
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const client = getRazorpayClient();
  const payment = await client.payments.fetch(paymentId);

  return {
    id: payment.id,
    orderId: payment.order_id,
    amount: Number(payment.amount),
    currency: payment.currency,
    status: payment.status,
    method: payment.method || undefined,
    description: payment.description || undefined,
    notes: payment.notes as Record<string, string> || undefined,
    created_at: Number(payment.created_at),
  };
}
