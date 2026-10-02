import { getRazorpayClient } from "./client";
import { validateAmount, validateCurrency } from "./config";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  created_at: number;
}

export async function createRazorpayOrder(params: {
  amountMinor: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  validateAmount(params.amountMinor);
  validateCurrency(params.currency);

  const client = getRazorpayClient();

  const order = await client.orders.create({
    amount: params.amountMinor,
    currency: params.currency,
    receipt: params.receipt,
    notes: params.notes,
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt || undefined,
    status: order.status,
    created_at: Number(order.created_at),
  };
}

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  const client = getRazorpayClient();
  const order = await client.orders.fetch(orderId);

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt || undefined,
    status: order.status,
    created_at: Number(order.created_at),
  };
}
