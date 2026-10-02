import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { GET } from "@/app/api/merchant/overview/route";
import { getMerchantOverview } from "@/lib/product/overview";
import { isApiErrorEnvelope, normalizeMerchantOverview } from "@/lib/product/overview-contract";

/**
 * End-to-end coverage for `GET /api/merchant/overview`.
 *
 * Guards the contract the merchant dashboard depends on: a 2xx response always
 * carries a fully populated `agentActivity` object, while failures return a
 * non-2xx `{ error }` envelope that is never mistaken for dashboard data.
 */

const createdUserIds: string[] = [];
const createdMerchantIds: string[] = [];

async function createMerchantUser(role: "MERCHANT" | "CUSTOMER" | "ADMIN" = "MERCHANT") {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: { email: `dash-${stamp}@test.com`, password: "hash", name: "Dash", role },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createMerchant(ownerId: string, businessName = "Dash Merchant") {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const merchant = await prisma.merchant.create({
    data: { ownerId, businessName, email: `biz-${stamp}@test.com` },
  });
  createdMerchantIds.push(merchant.id);
  return merchant;
}

async function requestOverview(token: string | null) {
  const request = new NextRequest("http://localhost/api/merchant/overview");
  if (token) request.cookies.set("growthos_token", token);
  const response = await GET(request);
  const body = await response.json();
  return { response, body };
}

afterEach(async () => {
  if (createdMerchantIds.length) {
    await prisma.agentRun.deleteMany({ where: { merchantId: { in: createdMerchantIds } } });
    await prisma.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } });
    createdMerchantIds.length = 0;
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

describe("GET /api/merchant/overview", () => {
  describe("successful response", () => {
    it("returns agent activity for a merchant with agent runs", async () => {
      const user = await createMerchantUser();
      const merchant = await createMerchant(user.id);

      const now = Date.now();
      await prisma.agentRun.createMany({
        data: [
          { merchantId: merchant.id, agentType: "OPPORTUNITY", status: "COMPLETED", startedAt: new Date(now - 1000) },
          { merchantId: merchant.id, agentType: "STRATEGY", status: "COMPLETED", startedAt: new Date(now - 2000) },
          { merchantId: merchant.id, agentType: "EXECUTION", status: "FAILED", startedAt: new Date(now - 3000) },
          // Older than the 30-day window, must not be counted.
          { merchantId: merchant.id, agentType: "EXECUTION", status: "COMPLETED", startedAt: new Date(now - 45 * 24 * 60 * 60 * 1000) },
        ],
      });

      const token = await signToken({ userId: user.id, email: user.email, role: "MERCHANT" });
      const { response, body } = await requestOverview(token);

      expect(response.status).toBe(200);
      expect(isApiErrorEnvelope(body)).toBe(false);
      expect(body.agentActivity).toBeDefined();
      expect(body.agentActivity.totalRuns).toBe(3);
      expect(body.agentActivity.completedRuns).toBe(2);
      expect(body.agentActivity.failedRuns).toBe(1);
      expect(body.agentActivity.lastRunAt).toEqual(expect.any(String));
      expect(body.agentActivity.successRate).toBeCloseTo((2 / 3) * 100);
    });

    it("returns legitimate zeros for a merchant with no agent runs", async () => {
      const user = await createMerchantUser();
      await createMerchant(user.id);

      const token = await signToken({ userId: user.id, email: user.email, role: "MERCHANT" });
      const { response, body } = await requestOverview(token);

      expect(response.status).toBe(200);
      expect(body.agentActivity).toEqual({
        totalRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        lastRunAt: null,
        successRate: 0,
      });
      // The previously crashing expression is safe on a real empty-state response.
      expect(() => body.agentActivity.totalRuns).not.toThrow();
      expect(() => body.agentActivity.successRate.toFixed(0)).not.toThrow();
    });

    it("always returns every documented top-level field", async () => {
      const user = await createMerchantUser();
      await createMerchant(user.id);
      const token = await signToken({ userId: user.id, email: user.email, role: "MERCHANT" });

      const { body } = await requestOverview(token);

      for (const key of [
        "revenue",
        "orders",
        "customers",
        "conversion",
        "averageOrderValue",
        "repeatCustomerRate",
        "paymentSuccessRate",
        "growthOpportunities",
        "activeStrategies",
        "pendingApprovals",
        "recentExecutions",
        "agentActivity",
        "riskAlerts",
        "aiBuyerActivity",
      ]) {
        expect(body, `missing key: ${key}`).toHaveProperty(key);
        expect(body[key], `undefined value: ${key}`).not.toBeUndefined();
      }
    });
  });

  describe("merchant isolation", () => {
    it("scopes agent activity to the authenticated merchant", async () => {
      const ownerA = await createMerchantUser();
      const ownerB = await createMerchantUser();
      const merchantA = await createMerchant(ownerA.id, "Merchant A");
      const merchantB = await createMerchant(ownerB.id, "Merchant B");

      await prisma.agentRun.createMany({
        data: [
          { merchantId: merchantA.id, agentType: "OPPORTUNITY", status: "COMPLETED", startedAt: new Date() },
          { merchantId: merchantA.id, agentType: "STRATEGY", status: "FAILED", startedAt: new Date() },
          { merchantId: merchantB.id, agentType: "OPPORTUNITY", status: "COMPLETED", startedAt: new Date() },
        ],
      });

      const overviewA = await getMerchantOverview(merchantA.id);
      const overviewB = await getMerchantOverview(merchantB.id);

      expect(overviewA.agentActivity.totalRuns).toBe(2);
      expect(overviewA.agentActivity.completedRuns).toBe(1);
      expect(overviewB.agentActivity.totalRuns).toBe(1);
      expect(overviewB.agentActivity.completedRuns).toBe(1);
    });

    it("does not leak another merchant's runs through the route", async () => {
      const ownerA = await createMerchantUser();
      const ownerB = await createMerchantUser();
      const merchantA = await createMerchant(ownerA.id, "Route Merchant A");
      const merchantB = await createMerchant(ownerB.id, "Route Merchant B");

      await prisma.agentRun.createMany({
        data: [
          { merchantId: merchantA.id, agentType: "OPPORTUNITY", status: "COMPLETED", startedAt: new Date() },
          ...Array.from({ length: 5 }, () => ({
            merchantId: merchantB.id,
            agentType: "EXECUTION",
            status: "COMPLETED",
            startedAt: new Date(),
          })),
        ],
      });

      const tokenA = await signToken({ userId: ownerA.id, email: ownerA.email, role: "MERCHANT" });
      const { body } = await requestOverview(tokenA);

      expect(body.agentActivity.totalRuns).toBe(1);
    });
  });

  describe("API errors", () => {
    it("returns 401 when no token is present", async () => {
      const { response, body } = await requestOverview(null);

      expect(response.status).toBe(401);
      expect(isApiErrorEnvelope(body)).toBe(true);
    });

    it("returns 403 for a non-merchant role", async () => {
      const user = await createMerchantUser("CUSTOMER");
      const token = await signToken({ userId: user.id, email: user.email, role: "CUSTOMER" });

      const { response, body } = await requestOverview(token);

      expect(response.status).toBe(403);
      expect(isApiErrorEnvelope(body)).toBe(true);
    });

    it("returns 403 for an invalid token", async () => {
      const { response, body } = await requestOverview("not-a-valid-jwt");

      expect(response.status).toBe(403);
      expect(isApiErrorEnvelope(body)).toBe(true);
    });

    it("returns 404 when the user has no merchant record", async () => {
      // A merchant-role user with a valid token but no Merchant row: the
      // layout allows this through, so the API must answer 404 rather than
      // returning a partial payload.
      const user = await createMerchantUser("MERCHANT");
      const token = await signToken({ userId: user.id, email: user.email, role: "MERCHANT" });

      const { response, body } = await requestOverview(token);

      expect(response.status).toBe(404);
      expect(isApiErrorEnvelope(body)).toBe(true);
      expect(body.agentActivity).toBeUndefined();
      // Normalizing an error envelope must still be crash-safe.
      expect(normalizeMerchantOverview(body).agentActivity.totalRuns).toBe(0);
    });
  });
});