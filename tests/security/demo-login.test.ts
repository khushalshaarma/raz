import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// `setAuthCookie` writes through `cookies()` from next/headers, which throws
// outside a live request scope. Capture what would be written instead.
const cookieWrites: Array<{ name: string; value: string; options?: any }> = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options?: any) => {
      cookieWrites.push({ name, value, options });
    },
    delete: () => {},
    get: () => undefined,
  }),
}));

const DEMO_PASSWORD = "demo-password-for-tests";

function request() {
  return new Request("http://localhost/api/auth/demo", { method: "POST" }) as any;
}

// Env is read per call by src/lib/config/demo.ts, so stubbing works without a
// module reset.
function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
}

const createdMerchantIds: string[] = [];
const createdUserIds: string[] = [];

async function seedDemoMerchant(opts: { role?: "MERCHANT" | "ADMIN"; email?: string } = {}) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = opts.email || `demo-${tag}@example.com`;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 4); // low cost: test speed
  const user = await prisma.user.create({
    data: { email, password: passwordHash, name: "Demo Merchant", role: opts.role || "MERCHANT" },
  });
  createdUserIds.push(user.id);
  if ((opts.role || "MERCHANT") === "MERCHANT") {
    const merchant = await prisma.merchant.create({
      data: { ownerId: user.id, businessName: "Demo UrbanWear", email },
    });
    createdMerchantIds.push(merchant.id);
    return { user, merchant };
  }
  return { user, merchant: null };
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
  await prisma.auditLog.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.order.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.customer.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.product.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } });
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function importRoute() {
  const mod = await import("@/app/api/auth/demo/route");
  return mod.POST;
}

describe("demo merchant entry (/api/auth/demo)", () => {
  beforeEach(async () => {
    cookieWrites.length = 0;
    vi.unstubAllEnvs();
    await cleanup();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanup();
  });

  it("is disabled by default when DEMO_LOGIN_ENABLED is not set", async () => {
    const POST = await importRoute();
    const { merchant, user } = await seedDemoMerchant();
    setEnv({ DEMO_LOGIN_ENABLED: undefined, DEMO_MERCHANT_EMAIL: user.email, DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD });

    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(cookieWrites).toHaveLength(0);
    void merchant;
  });

  it('is disabled when DEMO_LOGIN_ENABLED is anything other than "true"', async () => {
    const POST = await importRoute();
    const { user } = await seedDemoMerchant();
    for (const value of ["false", "1", "yes", "TRUE_ISH", ""]) {
      cookieWrites.length = 0;
      setEnv({ DEMO_LOGIN_ENABLED: value, DEMO_MERCHANT_EMAIL: user.email, DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD });
      const res = await POST(request());
      expect(res.status).toBe(404);
      expect(cookieWrites).toHaveLength(0);
    }
  });

  it("is hard-disabled in production even when the flag is true", async () => {
    const POST = await importRoute();
    const { user } = await seedDemoMerchant();
    setEnv({
      NODE_ENV: "production",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_MERCHANT_EMAIL: user.email,
      DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD,
    });

    const res = await POST(request());
    // Indistinguishable from "not available" so production cannot be probed.
    expect(res.status).toBe(404);
    expect(cookieWrites).toHaveLength(0);
  });

  it("refuses to run when the demo password is not configured", async () => {
    const POST = await importRoute();
    const { user } = await seedDemoMerchant();
    setEnv({ NODE_ENV: "development", DEMO_LOGIN_ENABLED: "true", DEMO_MERCHANT_EMAIL: user.email, DEMO_MERCHANT_PASSWORD: "" });

    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(cookieWrites).toHaveLength(0);
  });

  it("refuses when the configured demo password does not match the stored hash", async () => {
    const POST = await importRoute();
    const { user } = await seedDemoMerchant();
    setEnv({
      NODE_ENV: "development",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_MERCHANT_EMAIL: user.email,
      DEMO_MERCHANT_PASSWORD: "not-the-stored-password",
    });

    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(cookieWrites).toHaveLength(0);
  });

  it("refuses when the demo user has not been seeded", async () => {
    const POST = await importRoute();
    setEnv({
      NODE_ENV: "development",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_MERCHANT_EMAIL: "nobody-here@example.com",
      DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD,
    });

    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(cookieWrites).toHaveLength(0);
  });

  it("never grants a session for a non-merchant demo account", async () => {
    const POST = await importRoute();
    const { user } = await seedDemoMerchant({ role: "ADMIN" });
    setEnv({
      NODE_ENV: "development",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_MERCHANT_EMAIL: user.email,
      DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD,
    });

    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(cookieWrites).toHaveLength(0);
  });

  it("creates a real merchant session when enabled", async () => {
    const POST = await importRoute();
    const { user, merchant } = await seedDemoMerchant();
    setEnv({
      NODE_ENV: "development",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_MERCHANT_EMAIL: user.email,
      DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD,
    });

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.role).toBe("MERCHANT");
    expect(body.user.merchantId).toBe(merchant!.id);
    expect(body.redirectTo).toBe("/merchant/dashboard");

    // A signed session cookie is issued through the normal auth mechanism.
    expect(cookieWrites).toHaveLength(1);
    expect(cookieWrites[0].name).toBe("growthos_token");
    expect(cookieWrites[0].value.split(".")).toHaveLength(3);
    expect(cookieWrites[0].options?.httpOnly).toBe(true);
  });

  it("never returns the password, hash, or raw token in the response", async () => {
    const POST = await importRoute();
    const { user } = await seedDemoMerchant();
    setEnv({
      NODE_ENV: "development",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_MERCHANT_EMAIL: user.email,
      DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD,
    });

    const res = await POST(request());
    const text = await res.text();

    expect(text).not.toContain(DEMO_PASSWORD);
    expect(text).not.toContain(user.password);
    expect(text).not.toContain(cookieWrites[0]?.value);
    expect(JSON.parse(text).token).toBeUndefined();
  });

  it("binds the session to exactly one merchant, preserving isolation", async () => {
    const POST = await importRoute();
    const first = await seedDemoMerchant();
    const second = await seedDemoMerchant();

    setEnv({
      NODE_ENV: "development",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_MERCHANT_EMAIL: first.user.email,
      DEMO_MERCHANT_PASSWORD: DEMO_PASSWORD,
    });

    await POST(request());
    const body = JSON.parse(JSON.stringify({}));

    // Decode the issued JWT payload (no secret needed) to assert the claims.
    const payloadB64 = cookieWrites[0].value.split(".")[1];
    const claims = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));

    expect(claims.role).toBe("MERCHANT");
    expect(claims.merchantId).toBe(first.merchant!.id);
    // Never the other merchant, and never an admin role.
    expect(claims.merchantId).not.toBe(second.merchant!.id);
    expect(claims.role).not.toBe("ADMIN");
    void body;
  });
});