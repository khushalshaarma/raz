import { getRazorpayClient } from "./client";
import { validateAmount } from "./config";

export interface RazorpayRefund {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
  created_at: number;
}

export async function createRazorpayRefund(params: {
  paymentId: string;
  amountMinor?: number;
  notes?: Record<string, string>;
}): Promise<RazorpayRefund> {
  if (params.amountMinor !== undefined) {
    validateAmount(params.amountMinor);
  }

  const client = getRazorpayClient();

  const refund = await client.payments.refund(params.paymentId, {
    amount: params.amountMinor,
    notes: params.notes,
  });

  return {
    id: refund.id,
    paymentId: refund.payment_id,
    amount: Number(refund.amount),
    currency: refund.currency,
    status: refund.status,
    notes: refund.notes as Record<string, string> || undefined,
    created_at: Number(refund.created_at),
  };
}

export async function fetchRazorpayRefund(refundId: string): Promise<RazorpayRefund> {
  const client = getRazorpayClient();
  const refund = await client.refunds.fetch(refundId);

  return {
    id: refund.id,
    paymentId: refund.payment_id,
    amount: Number(refund.amount),
    currency: refund.currency,
    status: refund.status,
    notes: refund.notes as Record<string, string> || undefined,
    created_at: Number(refund.created_at),
  };
}
