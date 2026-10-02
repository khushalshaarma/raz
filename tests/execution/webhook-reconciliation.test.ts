import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const WEBHOOK_SECRET = "test_webhook_secret";

vi.mock("@/lib/execution/providers/razorpay/config", () => ({
  getRazorpayConfig: vi.fn(() => ({
    keyId: "rzp_test_dummy",
    keySecret: "test_key_secret",
    webhookSecret: WEBHOOK_SECRET,
    mode: "test" as const,
  })),
  isLiveMode: vi.fn(() => false),
  validateAmount: vi.fn(),
  validateCurrency: vi.fn(),
}));

const { processWebhookEvent } = await import("@/lib/execution/providers/razorpay/webhooks");

let seq = 0;
function uniqueIds() {
  seq += 1;
  return { rzpOrder: `order_w${seq}`, rzpPay: `pay_w${seq}`, event: `evt_w${seq}` };
}

function webhookSignature(body: string) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

// Fixtures are tracked so teardown deletes exactly what this file created.
// A blanket DELETE FROM merchant would violate foreign keys left behind by the
// other suites in the shared test database.
const createdMerchantIds: string[] = [];
const createdUserIds: string[] = [];

async function setup(orderOverrides: Record<string, unknown> = {}) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: { email: `wh-${tag}@example.com`, password: "hash", name: "WH Merchant", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "WH Merchant", email: `wh-${tag}@example.com` },
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
      ...orderOverrides,
    },
  });
  return { merchant, order };
}

async function cleanup() {
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
  // Rejected / unmatched events are stored with merchantId = null, so also clear
  // this file's events by their unique id prefix.
  await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: "evt_w" } } });
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

function capturedPayload(eventId: string, paymentId: string, orderId: string) {
  return JSON.stringify({
    entity: "event",
    event: "payment.captured",
    contains: ["payment"],
    id: eventId,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: 149889,
          currency: "INR",
          status: "captured",
        },
      },
    },
  });
}

describe("Razorpay webhook reconciliation", () => {
  beforeEach(async () => await cleanup());
  afterEach(async () => await cleanup());

  it("reconciles a captured payment when browser verification never ran", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    const body = capturedPayload(ids.event, ids.rzpPay, ids.rzpOrder);

    const result = await processWebhookEvent(body, webhookSignature(body), "payment.captured");

    expect(result.status).toBe("PROCESSED");
    expect(result.signatureVerified).toBe(true);

    const payment = await prisma.payment.findFirst({ where: { providerPaymentId: ids.rzpPay } });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe("CAPTURED");
    expect(payment?.orderId).toBe(order.id);
    expect(payment?.amountMinor).toBe(149889);

    // The order must advance just as it would via browser verification.
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("CONFIRMED");
  });

  it("rejects a webhook with an invalid signature and creates nothing", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    const body = capturedPayload(ids.event, ids.rzpPay, ids.rzpOrder);

    const result = await processWebhookEvent(body, "not-a-valid-signature", "payment.captured");

    expect(result.status).toBe("REJECTED");
    expect(result.signatureVerified).toBe(false);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("PENDING");
  });

  it("cannot attach a payment to an order that has no matching razorpay order", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: "order_different" });
    const body = capturedPayload(ids.event, ids.rzpPay, ids.rzpOrder);

    const result = await processWebhookEvent(body, webhookSignature(body), "payment.captured");

    expect(result.status).toBe("UNHANDLED");
    expect(result.signatureVerified).toBe(true);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("PENDING");
  });

  it("handles a duplicate delivery idempotently (no second payment)", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    const body = capturedPayload(ids.event, ids.rzpPay, ids.rzpOrder);

    const first = await processWebhookEvent(body, webhookSignature(body), "payment.captured");
    expect(first.status).toBe("PROCESSED");

    const second = await processWebhookEvent(body, webhookSignature(body), "payment.captured");
    expect(second.status).toBe("DUPLICATE");

    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("does not create a duplicate payment alongside an existing browser-verified one", async () => {
    const ids = uniqueIds();
    const { order } = await setup({ razorpayOrderId: ids.rzpOrder });
    await prisma.payment.create({
      data: {
        merchantId: order.merchantId,
        orderId: order.id,
        amountMinor: 149889,
        currency: "INR",
        status: "CAPTURED",
        provider: "razorpay",
        providerPaymentId: ids.rzpPay,
      },
    });

    const body = capturedPayload(ids.event, ids.rzpPay, ids.rzpOrder);
    const result = await processWebhookEvent(body, webhookSignature(body), "payment.captured");

    expect(result.status).toBe("PROCESSED");
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("never exposes the webhook secret in the stored event payload", async () => {
    const ids = uniqueIds();
    await setup({ razorpayOrderId: ids.rzpOrder });
    const body = capturedPayload(ids.event, ids.rzpPay, ids.rzpOrder);

    await processWebhookEvent(body, webhookSignature(body), "payment.captured");

    const event = await prisma.webhookEvent.findFirst({ where: { eventId: ids.event } });
    expect(event).not.toBeNull();
    expect(JSON.stringify(event)).not.toContain(WEBHOOK_SECRET);
  });
});