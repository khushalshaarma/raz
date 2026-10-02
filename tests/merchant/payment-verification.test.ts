import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const KEY_SECRET = "test_key_secret_value";
const KEY_ID = "rzp_test_dummy";

// The authenticated merchant for the current test. `merchantGuard` requires the
// session to carry a merchantId and the route scopes every query to it, so the
// mock identity has to track the fixture.
let currentMerchantId = "";

vi.mock("@/lib/auth", () => ({
  getAuthFromCookies: vi.fn(async () => ({
    userId: "user-under-test",
    email: "merchant@test.com",
    role: "MERCHANT" as const,
    get merchantId() {
      return currentMerchantId;
    },
  })),
}));

vi.mock("@/lib/execution/providers/razorpay/config", () => ({
  getRazorpayConfig: vi.fn(() => ({
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    webhookSecret: "test_webhook_secret",
    mode: "test" as const,
  })),
  isLiveMode: vi.fn(() => false),
  validateAmount: vi.fn(),
  validateCurrency: vi.fn(),
}));

// Razorpay provider calls are mocked: the route must never trust the client's
// success callback for money fields, it must read them from the provider.
const fetchRazorpayPayment = vi.fn();
const fetchRazorpayOrder = vi.fn();

vi.mock("@/lib/execution/providers/razorpay/payments", () => ({
  fetchRazorpayPayment: (...args: unknown[]) => fetchRazorpayPayment(...args),
}));

vi.mock("@/lib/execution/providers/razorpay/orders", () => ({
  fetchRazorpayOrder: (...args: unknown[]) => fetchRazorpayOrder(...args),
  createRazorpayOrder: vi.fn(),
}));

const { POST } = await import("@/app/api/merchant/payments/route");

let seq = 0;
function uniqueIds() {
  seq += 1;
  return { rzpOrder: `order_u${seq}`, rzpPay: `pay_u${seq}` };
}

function sign(orderId: string, paymentId: string) {
  return crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/merchant/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

// Fixtures are tracked so teardown deletes exactly what this file created.
// A blanket DELETE FROM merchant would violate foreign keys left behind by the
// other suites in the shared test database.
const createdMerchantIds: string[] = [];
const createdUserIds: string[] = [];

async function setup(overrides: Record<string, unknown> = {}, options: { becomeSessionMerchant?: boolean } = {}) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: { email: `pay-${tag}@example.com`, password: "hash", name: "Pay Merchant", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "Pay Merchant", email: `pay-${tag}@example.com` },
  });
  createdUserIds.push(user.id);
  createdMerchantIds.push(merchant.id);
  const customer = await prisma.customer.create({
    data: { merchantId: merchant.id, name: "Buyer", email: `buyer-${tag}@example.com` },
  });
  const order = await prisma.order.create({
    data: {
      merchantId: merchant.id,
      customerId: customer.id,
      status: "PENDING",
      currency: "INR",
      subtotalMinor: 149889,
      discountMinor: 0,
      totalMinor: 149889,
      ...overrides,
    },
  });
  if (options.becomeSessionMerchant !== false) {
    currentMerchantId = merchant.id;
  }
  return { user, merchant, customer, order };
}

async function cleanup() {
  currentMerchantId = "";
  const merchantIds = createdMerchantIds.splice(0);
  const userIds = createdUserIds.splice(0);
  if (merchantIds.length === 0 && userIds.length === 0) return;

  const orderRows = await prisma.order.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true },
  });
  const orderIds = orderRows.map((o) => o.id);

  if (orderIds.length > 0) {
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  }
  await prisma.webhookEvent.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.auditLog.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.auditEvent.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.order.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.customer.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.product.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } });
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

const TOTAL_MINOR = 149889;

function providerOrder(receipt: string | undefined, orderId: string, amount = TOTAL_MINOR) {
  return {
    id: orderId,
    amount,
    currency: "INR",
    receipt,
    status: "paid",
    created_at: Date.now(),
  };
}

function providerPayment(paymentId: string, orderId: string, status = "captured", amount = TOTAL_MINOR) {
  return {
    id: paymentId,
    orderId,
    amount,
    currency: "INR",
    status,
    created_at: Date.now(),
  };
}

describe("POST /api/merchant/payments (verification)", () => {
  beforeEach(async () => {
    await cleanup();
    fetchRazorpayPayment.mockReset();
    fetchRazorpayOrder.mockReset();
  });
  afterEach(async () => await cleanup());

  it("persists the payment and advances the order when the signature is valid and captured", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockResolvedValue(providerPayment(ids.rzpPay, ids.rzpOrder));

    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.captured).toBe(true);
    expect(body.payment.status).toBe("CAPTURED");
    expect(body.payment.amountMinor).toBe(TOTAL_MINOR);
    expect(body.orderStatus).toBe("CONFIRMED");

    const stored = await prisma.payment.findFirst({ where: { providerPaymentId: ids.rzpPay } });
    expect(stored?.status).toBe("CAPTURED");

    // The order must no longer be PENDING once the payment is captured.
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("CONFIRMED");
  });

  it("rejects an invalid signature without creating a payment", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });

    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: "f".repeat(64),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_SIGNATURE");
    expect(body.retryable).toBe(false);

    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("PENDING");
  });

  it("rejects a payment whose amount does not match the stored order", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockResolvedValue(providerPayment(ids.rzpPay, ids.rzpOrder, "captured", 1));

    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("AMOUNT_MISMATCH");
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("rejects a razorpay order that was minted for a different application order", async () => {
    const ids = uniqueIds();
    // The order is bound to a different provider order than the one presented.
    const { order } = await setup({ razorpayOrderId: "order_mapped_elsewhere" });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockResolvedValue(providerPayment(ids.rzpPay, ids.rzpOrder));

    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ORDER_MAPPING_MISMATCH");
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("rejects a payment that belongs to a different razorpay order", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockResolvedValue(providerPayment(ids.rzpPay, "order_somewhere_else"));

    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PAYMENT_ORDER_MISMATCH");
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("does not mark the order paid when the payment is not captured", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockResolvedValue(providerPayment(ids.rzpPay, ids.rzpOrder, "authorized"));

    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    const body = await res.json();

    expect(body.captured).toBe(false);
    expect(body.payment.status).toBe("AUTHORIZED");

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("PENDING");
  });

  it("is idempotent for a repeated verification and still reconciles the order", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockResolvedValue(providerPayment(ids.rzpPay, ids.rzpOrder));

    const payload = {
      merchantOrderId: order.id,
      razorpay_order_id: ids.rzpOrder,
      razorpay_payment_id: ids.rzpPay,
      razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
    };

    await POST(makeRequest(payload));
    // Reset the order to PENDING to prove the duplicate path reconciles it.
    await prisma.order.update({ where: { id: order.id }, data: { status: "PENDING" } });

    const res = await POST(makeRequest(payload));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    // Exactly one payment row despite two verifications.
    expect(await prisma.payment.count({ where: { providerPaymentId: ids.rzpPay } })).toBe(1);
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("CONFIRMED");
  });

  it("reports a retryable failure when the provider is unreachable", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.retryable).toBe(true);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("rejects verification for an order owned by another merchant", async () => {
    const ids = uniqueIds();
    const session = await setup();
    // A second merchant's order must not be verifiable by the session merchant.
    const foreign = await setup({}, { becomeSessionMerchant: false });
    fetchRazorpayOrder.mockResolvedValue(providerOrder(foreign.order.id, ids.rzpOrder));
    fetchRazorpayPayment.mockResolvedValue(providerPayment(ids.rzpPay, ids.rzpOrder));

    const res = await POST(
      makeRequest({
        merchantOrderId: foreign.order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid order");
    // No payment may be attached to the foreign order.
    expect(await prisma.payment.count({ where: { orderId: foreign.order.id } })).toBe(0);

    // Sanity: the session merchant's own order still verifies.
    fetchRazorpayOrder.mockResolvedValue(providerOrder(session.order.id, ids.rzpOrder));
    const own = await POST(
      makeRequest({
        merchantOrderId: session.order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: sign(ids.rzpOrder, ids.rzpPay),
      })
    );
    expect(own.status).toBe(200);
  });

  it("never echoes the key secret in any response", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    const res = await POST(
      makeRequest({
        merchantOrderId: order.id,
        razorpay_order_id: ids.rzpOrder,
        razorpay_payment_id: ids.rzpPay,
        razorpay_signature: "x".repeat(64),
      })
    );
    const text = await res.text();
    expect(text).not.toContain(KEY_SECRET);
  });
});