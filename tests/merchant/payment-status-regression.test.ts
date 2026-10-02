import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getMerchantOverview } from "@/lib/product/overview";
import { getPaymentHealth } from "@/lib/product/payment-health";

/**
 * Regression cover for the payment-status casing bug.
 *
 * `Payment.status` is written UPPERCASE by the seed (`CAPTURED`) but both
 * readers filtered on the lowercase literal `"captured"`. SQLite string
 * comparison is case-sensitive, so:
 *   - `getPaymentHealth` reported successRate 0 for a merchant whose payments
 *     were all captured;
 *   - `getMerchantOverview` computed a 0% success rate and then raised a
 *     HIGH-severity `PAYMENT_FAILURE` risk alert on a healthy merchant.
 */

const userIds: string[] = [];
const merchantIds: string[] = [];

async function createFixture(label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: { email: `pay-${stamp}@test.com`, password: "hash", name: "Pay", role: "MERCHANT" },
  });
  userIds.push(user.id);
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: label, email: `pay-biz-${stamp}@test.com` },
  });
  merchantIds.push(merchant.id);
  return merchant;
}

async function seedPayments(merchantId: string, statuses: string[]) {
  const customer = await prisma.customer.create({
    data: { merchantId, name: "Buyer", email: `buyer-${Date.now()}-${Math.random()}@test.com` },
  });
  for (const [index, status] of statuses.entries()) {
    const order = await prisma.order.create({
      data: {
        merchantId,
        customerId: customer.id,
        status: "COMPLETED",
        subtotalMinor: 100000,
        totalMinor: 100000,
      },
    });
    await prisma.payment.create({
      data: { merchantId, orderId: order.id, amountMinor: 100000, currency: "INR", status },
    });
    void index;
  }
}

beforeEach(() => {
  userIds.length = 0;
  merchantIds.length = 0;
});

afterEach(async () => {
  if (merchantIds.length) {
    const ids = { in: merchantIds };
    await prisma.governanceDecision.deleteMany({ where: { merchantId: ids } });
    await prisma.actionRequest.deleteMany({ where: { merchantId: ids } });
    await prisma.payment.deleteMany({ where: { merchantId: ids } });
    await prisma.order.deleteMany({ where: { merchantId: ids } });
    await prisma.customer.deleteMany({ where: { merchantId: ids } });
    await prisma.auditLog.deleteMany({ where: { merchantId: ids } });
    await prisma.merchant.deleteMany({ where: { id: ids } });
    merchantIds.length = 0;
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
  }
});

describe("getPaymentHealth with UPPERCASE stored statuses", () => {
  it("reports a real success rate for captured payments", async () => {
    const merchant = await createFixture("AllCaptured");
    await seedPayments(merchant.id, ["CAPTURED", "CAPTURED", "CAPTURED", "CAPTURED"]);

    const health = await getPaymentHealth(merchant.id);

    expect(health.totalPayments).toBe(4);
    expect(health.successfulPayments).toBe(4);
    expect(health.successRate).toBe(100);
    expect(health.failureRate).toBe(0);
  });

  it("counts failed and refunded payments correctly", async () => {
    const merchant = await createFixture("Mixed");
    await seedPayments(merchant.id, ["CAPTURED", "CAPTURED", "FAILED", "REFUNDED"]);

    const health = await getPaymentHealth(merchant.id);

    expect(health.totalPayments).toBe(4);
    expect(health.successfulPayments).toBe(2);
    expect(health.failedPayments).toBe(1);
    expect(health.totalRefunds).toBe(1);
    // Settled denominator = 2 captured + 1 failed (the refund is excluded and
    // reported separately via refundRate).
    expect(health.successRate).toBe(67);
    expect(health.failureRate).toBe(33);
    expect(health.refundRate).toBe(25);
  });

  it("treats CREATED and PENDING as unsettled, not as failures", async () => {
    const merchant = await createFixture("Pending");
    await seedPayments(merchant.id, ["CAPTURED", "CREATED", "CREATED", "PENDING"]);

    const health = await getPaymentHealth(merchant.id);

    expect(health.successfulPayments).toBe(1);
    expect(health.failedPayments).toBe(0);
    expect(health.unknownCount).toBe(3);
    // The single settled payment succeeded, so the rate is 100% — an
    // in-flight payment must not be counted as a failed collection.
    expect(health.successRate).toBe(100);
    expect(health.failureRate).toBe(0);
  });

  it("reports 100% when every payment is still in flight (nothing has failed)", async () => {
    const merchant = await createFixture("AllInFlight");
    await seedPayments(merchant.id, ["CREATED", "PENDING", "CREATED"]);

    const health = await getPaymentHealth(merchant.id);

    expect(health.totalPayments).toBe(3);
    expect(health.successfulPayments).toBe(0);
    expect(health.failedPayments).toBe(0);
    expect(health.successRate).toBe(100);
  });

  it("does not leak another merchant's payment health", async () => {
    const mine = await createFixture("Mine");
    const other = await createFixture("Other");
    await seedPayments(mine.id, ["CAPTURED", "FAILED"]);
    await seedPayments(other.id, ["CAPTURED", "CAPTURED"]);

    const health = await getPaymentHealth(mine.id);

    expect(health.totalPayments).toBe(2);
    expect(health.successfulPayments).toBe(1);
  });

  it("returns zeroed metrics for a merchant with no payments", async () => {
    const merchant = await createFixture("Empty");
    const health = await getPaymentHealth(merchant.id);
    expect(health.totalPayments).toBe(0);
    expect(health.successRate).toBe(100); // no payments is not a failure
  });
});

describe("getMerchantOverview payment success rate", () => {
  it("does not raise a false PAYMENT_FAILURE alert when payments are captured", async () => {
    const merchant = await createFixture("Healthy");
    // 18 of 35 captured, mirroring the seeded UrbanWear shape. The other 17
    // are still CREATED/PENDING — in flight, not failed — so the settled
    // success rate is 18/18 = 100% and no alert may fire.
    const statuses: string[] = [];
    for (let i = 0; i < 18; i++) statuses.push("CAPTURED");
    for (let i = 0; i < 11; i++) statuses.push("CREATED");
    for (let i = 0; i < 6; i++) statuses.push("PENDING");
    await seedPayments(merchant.id, statuses);

    const overview = await getMerchantOverview(merchant.id);

    // The bug produced 0% because "captured" matched nothing; an intermediate
    // fix produced 51% by counting unsettled payments as unsuccessful.
    expect(overview.paymentSuccessRate.value).toBe(100);
    const alerts = overview.riskAlerts.filter((a) => a.type === "PAYMENT_FAILURE");
    expect(alerts).toHaveLength(0);
  });

  it("raises no payment alert when every payment is captured", async () => {
    const merchant = await createFixture("Perfect");
    await seedPayments(merchant.id, ["CAPTURED", "CAPTURED", "CAPTURED"]);

    const overview = await getMerchantOverview(merchant.id);

    expect(overview.paymentSuccessRate.value).toBe(100);
    const paymentAlerts = overview.riskAlerts.filter((a) => a.type === "PAYMENT_FAILURE");
    expect(paymentAlerts).toHaveLength(0);
  });

  it("still raises a payment alert when the success rate genuinely collapses", async () => {
    const merchant = await createFixture("Broken");
    const statuses: string[] = ["CAPTURED"];
    for (let i = 0; i < 9; i++) statuses.push("FAILED");
    await seedPayments(merchant.id, statuses);

    const overview = await getMerchantOverview(merchant.id);

    // 1 captured of 10 settled payments.
    expect(overview.paymentSuccessRate.value).toBe(10);
    const paymentAlerts = overview.riskAlerts.filter((a) => a.type === "PAYMENT_FAILURE");
    expect(paymentAlerts).toHaveLength(1);
    expect(paymentAlerts[0].severity).toBe("HIGH");
  });

  it("keeps a genuinely poor mixed rate below the alert threshold", async () => {
    const merchant = await createFixture("PoorButReal");
    // 5 captured, 5 failed, 10 still in flight -> 50% of settled.
    const statuses: string[] = [];
    for (let i = 0; i < 5; i++) statuses.push("CAPTURED");
    for (let i = 0; i < 5; i++) statuses.push("FAILED");
    for (let i = 0; i < 10; i++) statuses.push("PENDING");
    await seedPayments(merchant.id, statuses);

    const overview = await getMerchantOverview(merchant.id);

    expect(overview.paymentSuccessRate.value).toBe(50);
    const paymentAlerts = overview.riskAlerts.filter((a) => a.type === "PAYMENT_FAILURE");
    expect(paymentAlerts).toHaveLength(1);
  });

  it("reports insufficient data when no payment has settled", async () => {
    const merchant = await createFixture("NothingSettled");
    await seedPayments(merchant.id, ["CREATED", "PENDING"]);

    const overview = await getMerchantOverview(merchant.id);

    expect(overview.paymentSuccessRate.source).toBe("INSUFFICIENT_DATA");
    const paymentAlerts = overview.riskAlerts.filter((a) => a.type === "PAYMENT_FAILURE");
    expect(paymentAlerts).toHaveLength(0);
  });

  it("reports no payments as insufficient data rather than 0%", async () => {
    const merchant = await createFixture("NoPayments");
    const overview = await getMerchantOverview(merchant.id);
    expect(overview.paymentSuccessRate.value).toBe(100);
    expect(overview.paymentSuccessRate.source).toBe("INSUFFICIENT_DATA");
  });
});

describe("getMerchantOverview governance block detection", () => {
  async function seedDecision(merchantId: string, decision: string, status: string) {
    // `GovernanceDecision.actionRequestId` is a required FK, so a real parent
    // row must exist.
    const actionRequest = await prisma.actionRequest.create({
      data: {
        merchantId,
        opportunityType: "DISCOUNT",
        strategyId: "s",
        strategyName: "s",
        recommendedScenario: "EXPECTED",
        decisionScore: 40,
        riskLevel: "HIGH",
        confidence: 40,
        status: "PENDING",
        amountMinor: 1000,
      },
    });
    return prisma.governanceDecision.create({
      data: {
        merchantId,
        actionRequestId: actionRequest.id,
        decision,
        decisionReason: "test",
        riskLevel: "HIGH",
        confidence: 40,
        status,
      },
    });
  }

  it("counts a block written with decision 'BLOCK' (governance agent)", async () => {
    const merchant = await createFixture("AgentBlock");
    await seedDecision(merchant.id, "BLOCK", "BLOCKED");

    const overview = await getMerchantOverview(merchant.id);
    const alerts = overview.riskAlerts.filter((a) => a.type === "GOVERNANCE_BLOCK");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("1 actions blocked");
  });

  it("counts a block written with decision 'BLOCKED'", async () => {
    const merchant = await createFixture("LegacyBlock");
    await seedDecision(merchant.id, "BLOCKED", "BLOCKED");

    const overview = await getMerchantOverview(merchant.id);
    const alerts = overview.riskAlerts.filter((a) => a.type === "GOVERNANCE_BLOCK");
    expect(alerts).toHaveLength(1);
  });

  it("does not raise a block alert for an ALLOW decision", async () => {
    const merchant = await createFixture("Allowed");
    await seedDecision(merchant.id, "ALLOW", "APPROVED");
    await seedDecision(merchant.id, "REQUIRE_APPROVAL", "PENDING");

    const overview = await getMerchantOverview(merchant.id);
    const alerts = overview.riskAlerts.filter((a) => a.type === "GOVERNANCE_BLOCK");
    expect(alerts).toHaveLength(0);
  });

  it("does not count another merchant's blocks", async () => {
    const mine = await createFixture("Mine");
    const other = await createFixture("Other");
    await seedDecision(other.id, "BLOCK", "BLOCKED");

    const overview = await getMerchantOverview(mine.id);
    const alerts = overview.riskAlerts.filter((a) => a.type === "GOVERNANCE_BLOCK");
    expect(alerts).toHaveLength(0);
  });
});
