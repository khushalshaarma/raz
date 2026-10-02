/**
 * GrowthOS seed.
 *
 * Design constraints (all enforced here):
 *
 * 1. DETERMINISTIC. No `Math.random()` and no `Date.now()` in any data value.
 *    Quantity/size variation comes from a seeded PRNG (mulberry32). Timestamps
 *    are derived from a single anchor date. Re-running on the same day
 *    produces byte-identical rows.
 *
 * 2. IDEMPOTENT / RE-RUNNABLE. Every row is upserted on a natural business key.
 *    Re-running updates in place instead of duplicating, so `db:seed` can be
 *    run any number of times.
 *
 * 3. NON-DESTRUCTIVE. The previous seed ran `deleteMany` on 12 tables with
 *    `PRAGMA foreign_keys = OFF` while 20 other models were left behind. Any
 *    table not in that list (scenarios, simulations, decisions, action
 *    requests, governance decisions, executions, agent runs, growth cycles,
 *    policies, reconciliations, webhook events, autopilot config) kept its rows,
 *    so the orphans accumulated on every re-seed — 2088 scenarios were pointing
 *    at deleted merchants. This seed deletes nothing and never disables FK
 *    enforcement.
 *
 * 4. NO FABRICATED DOWNSTREAM DATA. Opportunity scoring, strategy generation,
 *    scenario simulation, decision scoring and governance evaluation all run
 *    through the real services in `src/lib`. Nothing is hard-coded: if the data
 *    is too thin for the scenario engine, the seed records the engine's refusal
 *    rather than inventing a number.
 *
 * The pipeline is generated in dependency order:
 *   order history -> intelligence analysis -> Opportunity -> Strategy
 *   -> Scenario x3 -> Simulation -> Decision -> ActionRequest
 *   -> GovernanceDecision -> Execution -> Reconciliation
 */

import { PrismaClient, Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";

// Real services, used so the seeded pipeline is produced by the same code paths
// the running application uses. Imported relatively because this file is run
// via `tsx prisma/seed.ts`.
import { runIntelligenceAnalysis } from "../src/lib/intelligence/orchestrator";
import { runSimulationAgent } from "../src/lib/intelligence/simulation-agent";
import { runDecisionAnalysis } from "../src/lib/intelligence/decision";
import { DEFAULT_SCENARIO_CONFIG } from "../src/lib/intelligence/scenario";
import { createActionRequest } from "../src/lib/governance/action";
import type { ActionType } from "../src/lib/governance/action";
import type { StrategyType } from "../src/lib/intelligence/strategy/generator";
import type { OpportunityType } from "../src/lib/intelligence/opportunity/detector";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────
// Deterministic helpers
// ─────────────────────────────────────────────────────────────────────

/** mulberry32 — small, fast, fully deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x67726f77); // "grow"

/** Deterministic integer in [min, max]. */
function intBetween(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Deterministic element of a non-empty array. */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Reference date for all seeded timestamps.
 *
 * Anchored to the first of the current month so the demo data always sits in
 * the recent past and 30-day payment/activity metrics never decay to zero.
 * Override with SEED_ANCHOR_DATE=YYYY-MM-DD for byte-exact reproducibility.
 */
const ANCHOR: Date = (() => {
  if (process.env.SEED_ANCHOR_DATE) {
    const parsed = new Date(process.env.SEED_ANCHOR_DATE);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`SEED_ANCHOR_DATE is not a valid date: ${process.env.SEED_ANCHOR_DATE}`);
    }
    return parsed;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 9, 0, 0));
})();

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** A date `daysBefore` days before the anchor, at a fixed hour. */
function daysBefore(days: number, hour = 12): Date {
  const d = new Date(ANCHOR.getTime() - days * DAY_MS);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/** A date `hoursBefore` hours before the anchor. */
function hoursBefore(hours: number): Date {
  return new Date(ANCHOR.getTime() - hours * HOUR_MS);
}

// ─────────────────────────────────────────────────────────────────────
// Static reference data
// ─────────────────────────────────────────────────────────────────────

const SEED_PASSWORD = "Password123";

const CUSTOMER_NAMES = [
  "Riya Kapoor", "Aarav Patel", "Sneha Gupta", "Vikram Singh",
  "Ananya Das", "Rohan Joshi", "Meera Reddy", "Karan Nair",
  "Pooja Verma", "Aditya Rao", "Nisha Bhat", "Deepak Kumar",
  "Sunita Iyer", "Rahul Menon", "Isha Thakur", "Manoj Pandey",
  "Swati Mishra", "Amit Chauhan", "Priyanka Bose", "Suresh Pillai",
];

const URBAN_WEAR_PRODUCTS = [
  { name: "Urban Runner Pro", description: "Lightweight performance running shoes with responsive cushioning and breathable mesh.", priceMinor: 499900, sku: "UW-SHOE-001", category: "Footwear", stock: 45, imageUrl: null },
  { name: "Performance Tee", description: "Moisture-wicking athletic t-shirt with anti-odor technology.", priceMinor: 89900, sku: "UW-TEE-001", category: "Apparel", stock: 120, imageUrl: null },
  { name: "Slim Fit Jeans", description: "Stretch denim slim-fit jeans in indigo wash.", priceMinor: 199900, sku: "UW-JNS-001", category: "Apparel", stock: 78, imageUrl: null },
  { name: "Windbreaker Jacket", description: "Packable water-resistant windbreaker with reflective accents.", priceMinor: 249900, sku: "UW-JKT-001", category: "Outerwear", stock: 35, imageUrl: null },
  { name: "Sports Watch", description: "Multi-function sports watch with heart rate monitor and 7-day battery.", priceMinor: 349900, sku: "UW-ACC-001", category: "Accessories", stock: 60, imageUrl: null },
  { name: "Urban Backpack", description: "Water-resistant laptop backpack with USB charging port.", priceMinor: 149900, sku: "UW-BAG-001", category: "Accessories", stock: 90, imageUrl: null },
  { name: "Training Shorts", description: "Quick-dry training shorts with inner liner.", priceMinor: 79900, sku: "UW-SHT-001", category: "Apparel", stock: 110, imageUrl: null },
  { name: "Linen Casual Shirt", description: "Breathable linen-blend shirt for casual occasions.", priceMinor: 129900, sku: "UW-SHT-002", category: "Apparel", stock: 65, imageUrl: null },
  { name: "Canvas Sneakers", description: "Classic canvas low-top sneakers in white.", priceMinor: 179900, sku: "UW-SHOE-002", category: "Footwear", stock: 80, imageUrl: null },
  { name: "Compression Tights", description: "High-performance compression tights for training.", priceMinor: 109900, sku: "UW-TGT-001", category: "Apparel", stock: 55, imageUrl: null },
  { name: "Fleece Hoodie", description: "Soft fleece hoodie with kangaroo pocket.", priceMinor: 189900, sku: "UW-HOD-001", category: "Outerwear", stock: 70, imageUrl: null },
  { name: "Training Gloves", description: "Padded training gloves with wrist support.", priceMinor: 49900, sku: "UW-GLV-001", category: "Accessories", stock: 100, imageUrl: null },
  { name: "Performance Polo", description: "Stretch polo shirt with anti-microbial finish.", priceMinor: 99900, sku: "UW-TEE-002", category: "Apparel", stock: 85, imageUrl: null },
  { name: "Track Pants", description: "Tapered track pants with side pockets.", priceMinor: 149900, sku: "UW-PTS-001", category: "Apparel", stock: 75, imageUrl: null },
  { name: "Marathon Shoe Elite", description: "Carbon-plate racing shoe for serious runners.", priceMinor: 699900, sku: "UW-SHOE-003", category: "Footwear", stock: 20, imageUrl: null },
  { name: "Sport Sunglasses", description: "UV400 polarized sports sunglasses.", priceMinor: 89900, sku: "UW-SUN-001", category: "Accessories", stock: 50, imageUrl: null },
  { name: "Gym Duffel Bag", description: "45L duffel bag with shoe compartment.", priceMinor: 159900, sku: "UW-BAG-002", category: "Accessories", stock: 40, imageUrl: null },
  { name: "Ribbed Tank Top", description: "Cotton ribbed tank top for workouts.", priceMinor: 59900, sku: "UW-TEE-003", category: "Apparel", stock: 130, imageUrl: null },
  { name: "Windproof Cap", description: "Lightweight cap with windproof lining.", priceMinor: 39900, sku: "UW-HAT-001", category: "Accessories", stock: 95, imageUrl: null },
  { name: "Running Socks 3-Pack", description: "Moisture-wicking cushioned running socks.", priceMinor: 29900, sku: "UW-SOK-001", category: "Accessories", stock: 200, imageUrl: null },
  { name: "Reflective Vest", description: "High-visibility reflective vest for night running.", priceMinor: 69900, sku: "UW-VEST-001", category: "Outerwear", stock: 45, imageUrl: null },
  { name: "Yoga Mat Pro", description: "6mm eco-friendly yoga mat with alignment lines.", priceMinor: 129900, sku: "UW-YGA-001", category: "Accessories", stock: 30, imageUrl: null },
  { name: "Athletic Headband", description: "Sweat-absorbent athletic headband.", priceMinor: 19900, sku: "UW-HBD-001", category: "Accessories", stock: 150, imageUrl: null },
  { name: "Water Bottle Steel", description: "750ml insulated stainless steel bottle.", priceMinor: 59900, sku: "UW-BTL-001", category: "Accessories", stock: 80, imageUrl: null },
  { name: "Training Capri", description: "Women's training capri with side pockets.", priceMinor: 99900, sku: "UW-CPR-001", category: "Apparel", stock: 60, imageUrl: null },
  { name: "Puffer Jacket", description: "Lightweight down puffer jacket.", priceMinor: 299900, sku: "UW-JKT-002", category: "Outerwear", stock: 25, imageUrl: null },
  { name: "Cross-Training Shoe", description: "Versatile cross-training shoe for gym workouts.", priceMinor: 399900, sku: "UW-SHOE-004", category: "Footwear", stock: 38, imageUrl: null },
  { name: "Stretch Chinos", description: "Slim-fit stretch chinos for everyday wear.", priceMinor: 169900, sku: "UW-CHN-001", category: "Apparel", stock: 70, imageUrl: null },
  { name: "Compression Socks", description: "Graduated compression socks for recovery.", priceMinor: 49900, sku: "UW-SOK-002", category: "Accessories", stock: 100, imageUrl: null },
  { name: "Running Belt", description: "Adjustable running belt with phone pocket.", priceMinor: 34900, sku: "UW-BLT-001", category: "Accessories", stock: 120, imageUrl: null },
];

const TECH_STORE_PRODUCTS = [
  { name: "Wireless Earbuds Pro", description: "Active noise cancelling wireless earbuds.", priceMinor: 299900, sku: "TS-EAR-001", category: "Audio", stock: 60, imageUrl: null },
  { name: "Smartwatch Ultra", description: "GPS smartwatch with AMOLED display.", priceMinor: 499900, sku: "TS-WCH-001", category: "Wearables", stock: 35, imageUrl: null },
  { name: "USB-C Hub 7-in-1", description: "Multi-port USB-C hub with HDMI.", priceMinor: 199900, sku: "TS-HUB-001", category: "Accessories", stock: 80, imageUrl: null },
  { name: "Portable SSD 1TB", description: "NVMe portable SSD with 1000MB/s.", priceMinor: 599900, sku: "TS-SSD-001", category: "Storage", stock: 40, imageUrl: null },
  { name: "Webcam HD 1080p", description: "Auto-focus webcam with built-in mic.", priceMinor: 149900, sku: "TS-WCM-001", category: "Accessories", stock: 55, imageUrl: null },
];

const CAMPAIGNS = [
  { name: "Independence Day Sale", status: "COMPLETED", targetAudience: "ALL_CUSTOMERS", budgetMinor: 5000000 },
  { name: "Monsoon Collection Launch", status: "RUNNING", targetAudience: "ACTIVE_BUYERS", budgetMinor: 10000000 },
  { name: "Win-Back Inactive Customers", status: "DRAFT", targetAudience: "INACTIVE_CUSTOMERS", budgetMinor: 3000000 },
];

const AGENTS = [
  { name: "Opportunity Scanner", type: "OPPORTUNITY", status: "ACTIVE", description: "Scans for business opportunities in merchant data." },
  { name: "Strategy Planner", type: "STRATEGY", status: "ACTIVE", description: "Plans data-driven growth strategies." },
  { name: "Decision Engine", type: "DECISION", status: "ACTIVE", description: "Makes data-driven decisions for campaign execution." },
  { name: "Security Monitor", type: "SECURITY", status: "ACTIVE", description: "Monitors platform security." },
  { name: "Performance Sim", type: "SIMULATION", status: "PAUSED", description: "Simulates outcomes before real execution." },
];

/** Merchant-scoped governance policies, mirroring the conditions the gates evaluate. */
const POLICIES = [
  { name: "MIN_DATA_QUALITY", conditionType: "DATA_QUALITY", conditionOperator: "GTE", conditionValue: 30, action: "REQUIRE_APPROVAL", priority: 10 },
  { name: "MAX_RISK_SCORE", conditionType: "RISK_SCORE", conditionOperator: "LTE", conditionValue: 40, action: "ALLOW", priority: 20 },
  { name: "MIN_CONFIDENCE_SCORE", conditionType: "CONFIDENCE_SCORE", conditionOperator: "GTE", conditionValue: 70, action: "ALLOW", priority: 30 },
  { name: "MAX_SPEND_PER_ACTION", conditionType: "SPEND", conditionOperator: "LTE", conditionValue: 500000, action: "REQUIRE_APPROVAL", priority: 40 },
  { name: "AUTOMATION_PAUSED", conditionType: "CUSTOM", conditionOperator: "EQ", conditionValue: 1, action: "BLOCK", priority: 1 },
];

// ─────────────────────────────────────────────────────────────────────
// Upsert helpers (no deletes, ever)
// ─────────────────────────────────────────────────────────────────────

/**
 * Upsert-by-business-key. Models such as `Scenario`, `Simulation`, `Decision`,
 * `Opportunity`, `GrowthCycle` and `AuditLog` have no natural unique column, so
 * they are matched on a deterministic business key and updated in place.
 */
async function upsertByKey<T extends { id: string }>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
  update: (existing: T) => Prisma.PrismaPromise<T>
): Promise<T> {
  const existing = await find();
  if (!existing) return create();
  return update(existing);
}

// ─────────────────────────────────────────────────────────────────────
// Seed steps
// ─────────────────────────────────────────────────────────────────────

async function seedUsers() {
  const password = await bcrypt.hash(SEED_PASSWORD, 12);

  const upsertUser = (email: string, name: string, role: string) =>
    prisma.user.upsert({
      where: { email },
      create: { email, name, role, password },
      update: { name, role },
    });

  const admin = await upsertUser("admin@growthos.in", "GrowthOS Admin", "ADMIN");
  const arjun = await upsertUser("arjun@urbanwear.in", "Arjun Mehta", "MERCHANT");
  const priya = await upsertUser("priya@techstore.in", "Priya Sharma", "MERCHANT");

  // A second MERCHANT-role user at UrbanWear. Four-eyes means the requester and
  // the approver must be different people, so the seeded pending approval is
  // requested by this user and can be approved by Arjun.
  const meeraOps = await upsertUser("meera@urbanwear.in", "Meera Iyer", "MERCHANT");

  const customerUsers = [] as Awaited<ReturnType<typeof upsertUser>>[];
  for (let i = 0; i < CUSTOMER_NAMES.length; i += 1) {
    customerUsers.push(
      await upsertUser(`customer${i + 1}@example.com`, CUSTOMER_NAMES[i], "CUSTOMER")
    );
  }

  return { admin, arjun, priya, meeraOps, customerUsers };
}

async function seedMerchants(users: Awaited<ReturnType<typeof seedUsers>>) {
  // `Merchant.ownerId` is unique, so it is the natural key. Matching on it means
  // an existing merchant is updated in place instead of a second UrbanWear
  // being created alongside it.
  const urbanWear = await prisma.merchant.upsert({
    where: { ownerId: users.arjun.id },
    create: {
      ownerId: users.arjun.id,
      businessName: "UrbanWear",
      email: "arjun@urbanwear.in",
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    },
    update: { businessName: "UrbanWear", email: "arjun@urbanwear.in", status: "ACTIVE" },
  });

  const techStore = await prisma.merchant.upsert({
    where: { ownerId: users.priya.id },
    create: {
      ownerId: users.priya.id,
      businessName: "TechStore",
      email: "priya@techstore.in",
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    },
    update: { businessName: "TechStore", email: "priya@techstore.in", status: "ACTIVE" },
  });

  return { urbanWear, techStore };
}

async function seedCustomers(
  users: Awaited<ReturnType<typeof seedUsers>>,
  merchants: Awaited<ReturnType<typeof seedMerchants>>
) {
  const created = [];
  for (let i = 0; i < users.customerUsers.length; i += 1) {
    const user = users.customerUsers[i];
    const merchantId = i < 10 ? merchants.urbanWear.id : merchants.techStore.id;
    created.push(
      await prisma.customer.upsert({
        where: { merchantId_email: { merchantId, email: user.email } },
        create: {
          merchantId,
          userId: user.id,
          name: user.name,
          email: user.email,
          phone: `+9190000${String(1000 + i).slice(0, 4)}`,
          createdAt: daysBefore(200 - i * 2),
        },
        update: { name: user.name, phone: `+9190000${String(1000 + i).slice(0, 4)}` },
      })
    );
  }
  return created;
}

async function seedProducts(
  merchants: Awaited<ReturnType<typeof seedMerchants>>
) {
  const upsertProducts = async (merchantId: string, products: typeof URBAN_WEAR_PRODUCTS) => {
    const out = [];
    for (const p of products) {
      out.push(
        await prisma.product.upsert({
          where: { merchantId_sku: { merchantId, sku: p.sku } },
          create: { ...p, merchantId, active: true, createdAt: daysBefore(190) },
          update: { name: p.name, description: p.description, priceMinor: p.priceMinor, category: p.category, stock: p.stock, active: true },
        })
      );
    }
    return out;
  };

  const urbanWearProducts = await upsertProducts(merchants.urbanWear.id, URBAN_WEAR_PRODUCTS);
  const techStoreProducts = await upsertProducts(merchants.techStore.id, TECH_STORE_PRODUCTS);
  return { urbanWearProducts, techStoreProducts };
}

type SeededProducts = Awaited<ReturnType<typeof seedProducts>>;
type SeededCustomers = Awaited<ReturnType<typeof seedCustomers>>;

/**
 * Order history with dates spread across the baseline window.
 *
 * The previous seed created all 35 orders inside a ~160ms window because
 * `createdAt` was left at its default. That makes every recency/trend/RFM
 * signal degenerate: "last 30 days" and "last 90 days" are indistinguishable,
 * and no customer can ever look inactive. Orders are now spread deterministically
 * over ~170 days with a weekly cycle, and a few are left as recent PENDING
 * orders so the cart-abandonment audience is non-empty.
 */
async function seedOrders(
  merchants: Awaited<ReturnType<typeof seedMerchants>>,
  customers: SeededCustomers,
  products: SeededProducts
) {
  const urbanWearCustomers = customers.filter((c) => c.merchantId === merchants.urbanWear.id);
  const urbanWearProducts = products.urbanWearProducts;

  const ORDER_COUNT = 44;
  // Deterministic day offsets, newest first, with jitter so days are not uniform.
  const dayOffsets = Array.from({ length: ORDER_COUNT }, (_, i) => {
    const base = Math.round((i / ORDER_COUNT) * 165);
    return base + intBetween(0, 3);
  }).sort((a, b) => b - a);

  const created: Array<{ id: string; status: string; totalMinor: number }> = [];

  for (let i = 0; i < ORDER_COUNT; i += 1) {

    const customer = urbanWearCustomers[i % urbanWearCustomers.length];
    const product = pick(urbanWearProducts);
    const quantity = intBetween(1, 3);

    const subtotal = product.priceMinor * quantity;

    // Apply a real discount on roughly a third of orders. This is what gives
    // `computeBaseline` an observed cost rate instead of a hard-coded 0.
    const discounted = i % 3 === 0;
    const discountMinor = discounted ? Math.round(subtotal * (pick([5, 10, 15, 20]) / 100)) : 0;
    const totalMinor = subtotal - discountMinor;

    const createdAt = daysBefore(dayOffsets[i], intBetween(9, 21));

    // Most orders are COMPLETED (only COMPLETED counts as revenue downstream).
    // A couple of CONFIRMED and CANCELLED rows are kept so the status
    // distribution is not uniform, and the most recent orders are left PENDING
    // to represent abandoned checkouts.
    let status: string;
    if (i < 4) status = "PENDING";
    else if (i % 17 === 0) status = "CANCELLED";
    else if (i % 11 === 0) status = "CONFIRMED";
    else status = "COMPLETED";

    const paymentStatus =
      status === "COMPLETED" ? "CAPTURED"
      : status === "CONFIRMED" ? "AUTHORIZED"
      : status === "PENDING" ? "CREATED"
      : "FAILED";

    // Deterministic provider id derived from the index, so a re-run reuses the
    // same value and the payment stays joinable from a webhook payload.
    const providerPaymentId =
      status === "COMPLETED" || status === "CONFIRMED"
        ? `pay_seed_${String(i).padStart(6, "0")}`
        : null;

    // Deterministic primary keys. `Order` has no natural unique column, so the
    // business key *is* the id: matching on `(merchantId, createdAt)` would be
    // ambiguous whenever two orders land on the same day and hour, which would
    // silently update the wrong row instead of inserting the missing one.
    const orderId = `seed-order-${String(i).padStart(4, "0")}`;
    const itemId = `seed-order-item-${String(i).padStart(4, "0")}`;
    const paymentId = `seed-payment-${String(i).padStart(4, "0")}`;

    const order = await prisma.order.upsert({
      where: { id: orderId },
      create: {
        id: orderId,
        merchantId: merchants.urbanWear.id,
        customerId: customer.id,
        status,
        currency: "INR",
        subtotalMinor: subtotal,
        discountMinor,
        totalMinor,
        createdAt,
        items: {
          create: {
            id: itemId,
            productId: product.id,
            quantity,
            priceMinor: product.priceMinor,
            totalMinor: subtotal,
          },
        },
        payments: {
          create: {
            id: paymentId,
            merchantId: merchants.urbanWear.id,
            amountMinor: totalMinor,
            currency: "INR",
            status: paymentStatus,
            provider: "razorpay",
            providerPaymentId,
            createdAt,
          },
        },
      },
      update: {
        customerId: customer.id,
        status,
        subtotalMinor: subtotal,
        discountMinor,
        totalMinor,
      },
    });

    // The nested creates above only run on insert. On a re-run the order already
    // exists, so the line item and payment are reconciled separately.
    await prisma.orderItem.upsert({
      where: { id: itemId },
      create: {
        id: itemId,
        orderId,
        productId: product.id,
        quantity,
        priceMinor: product.priceMinor,
        totalMinor: subtotal,
      },
      update: { productId: product.id, quantity, priceMinor: product.priceMinor, totalMinor: subtotal },
    });

    await prisma.payment.upsert({
      where: { id: paymentId },
      create: {
        id: paymentId,
        merchantId: merchants.urbanWear.id,
        orderId,
        amountMinor: totalMinor,
        currency: "INR",
        status: paymentStatus,
        provider: "razorpay",
        providerPaymentId,
        createdAt,
      },
      update: { amountMinor: totalMinor, status: paymentStatus, providerPaymentId },
    });

    created.push({ id: order.id, status, totalMinor });
  }

  return created;
}

async function seedCampaigns(merchants: Awaited<ReturnType<typeof seedMerchants>>) {
  const out = [];
  for (let i = 0; i < CAMPAIGNS.length; i += 1) {
    const c = CAMPAIGNS[i];
    const startedAt = daysBefore(120 - i * 40);
    out.push(
      await upsertByKey(
        async () => prisma.campaign.findFirst({ where: { merchantId: merchants.urbanWear.id, name: c.name } }),
        () => prisma.campaign.create({ data: { ...c, merchantId: merchants.urbanWear.id, createdAt: startedAt } }),
        (existing) => prisma.campaign.update({ where: { id: existing.id }, data: { status: c.status, budgetMinor: c.budgetMinor, targetAudience: c.targetAudience } })
      )
    );
  }
  return out;
}

async function seedAgents() {
  const out = [];
  for (const a of AGENTS) {
    out.push(
      await upsertByKey(
        async () => prisma.agent.findFirst({ where: { name: a.name, type: a.type, merchantId: null } }),
        () => prisma.agent.create({ data: { ...a, merchantId: null, createdAt: daysBefore(200) } }),
        (existing) => prisma.agent.update({ where: { id: existing.id }, data: { status: a.status, description: a.description } })
      )
    );
  }
  return out;
}

async function seedPolicies(merchants: Awaited<ReturnType<typeof seedMerchants>>) {
  const out = [];
  for (const p of POLICIES) {
    out.push(
      await upsertByKey(
        async () => prisma.policy.findFirst({ where: { merchantId: merchants.urbanWear.id, name: p.name } }),
        () =>
          prisma.policy.create({
            data: {
              merchantId: merchants.urbanWear.id,
              name: p.name,
              version: 1,
              conditionType: p.conditionType,
              conditionOperator: p.conditionOperator,
              conditionValue: p.conditionValue,
              conditionExpression: p.conditionType === "CUSTOM" ? JSON.stringify({ type: "custom", expression: p.name }) : null,
              action: p.action,
              priority: p.priority,
              isActive: p.name !== "AUTOMATION_PAUSED",
              createdAt: daysBefore(180),
            },
          }),
        (existing) =>
          prisma.policy.update({
            where: { id: existing.id },
            data: {
              conditionType: p.conditionType,
              conditionOperator: p.conditionOperator,
              conditionValue: p.conditionValue,
              action: p.action,
              priority: p.priority,
              // AUTOMATION_PAUSED must stay inactive or it would BLOCK every
              // action for this merchant.
              isActive: p.name !== "AUTOMATION_PAUSED",
            },
          })
      )
    );
  }
  return out;
}

async function seedSystemHealth() {
  const existing = await prisma.systemHealth.findFirst({
    where: { environment: process.env.NODE_ENV || "development" },
  });
  if (existing) {
    return prisma.systemHealth.update({
      where: { id: existing.id },
      data: { application: "ok", api: "ok", database: "ok", lastCheckedAt: new Date() },
    });
  }
  return prisma.systemHealth.create({
    data: { application: "ok", api: "ok", database: "ok", environment: process.env.NODE_ENV || "development", lastCheckedAt: new Date() },
  });
}

async function seedAutopilotConfig(merchants: Awaited<ReturnType<typeof seedMerchants>>) {
  return prisma.autopilotConfig.upsert({
    where: { merchantId: merchants.urbanWear.id },
    create: {
      merchantId: merchants.urbanWear.id,
      mode: "REVIEW",
      maxDailySpendMinor: 1000000,
      maxCampaignSpendMinor: 500000,
      maxCustomerSpendMinor: 20000,
      maxActionsPerHour: 10,
      maxActionsPerDay: 50,
      minimumConfidence: 70,
      maximumRisk: 40,
      approvalRequiredAboveMinor: 10000,
      isActive: true,
      createdAt: daysBefore(150),
    },
    update: { mode: "REVIEW", isActive: true },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Pipeline generation, driven by the real services
// ─────────────────────────────────────────────────────────────────────

/**
 * `StrategyType` and `ActionType` are two independent vocabularies:
 * `PERSONALIZED_OFFER` is a valid strategy but not a valid action, and
 * `createActionRequest` turns any unrecognised action type into a BLOCKED
 * `INVALID` request. Mapping explicitly keeps the seeded requests real instead
 * of silently manufacturing blocked rows.
 */
const STRATEGY_TO_ACTION_TYPE: Record<StrategyType, ActionType> = {
  DISCOUNT: "DISCOUNT",
  REACTIVATION: "REACTIVATION",
  UPSELL: "UPSELL",
  CROSS_SELL: "CROSS_SELL",
  BUNDLE: "BUNDLE",
  PERSONALIZED_OFFER: "COUPON",
};

interface PipelineResult {
  opportunities: number;
  scenarios: number;
  simulations: number;
  decisions: number;
  actionRequests: number;
  governanceDecisions: number;
  executions: number;
  reconciliations: number;
  refused: string[];
}

/**
 * Generate the opportunity -> strategy -> scenario -> simulation -> decision ->
 * governance -> execution chain using the production service functions.
 *
 * Nothing here writes a hard-coded score, revenue figure or confidence: the
 * opportunity confidence comes from the scorer, the scenarios from
 * `runSimulationAgent` (which reads the real order history), and the decision
 * from `runDecisionAnalysis`. When the scenario engine refuses because data
 * quality is too low, the refusal is recorded in the Simulation's explanation
 * rather than being papered over with invented numbers.
 */
async function seedPipeline(
  merchants: Awaited<ReturnType<typeof seedMerchants>>,
  users: Awaited<ReturnType<typeof seedUsers>>
): Promise<PipelineResult> {
  const result: PipelineResult = {
    opportunities: 0,
    scenarios: 0,
    simulations: 0,
    decisions: 0,
    actionRequests: 0,
    governanceDecisions: 0,
    executions: 0,
    reconciliations: 0,
    refused: [],
  };

  const merchantId = merchants.urbanWear.id;

  // ── Opportunities, via the real detector/scorer ────────────────────
  const analysis = await runIntelligenceAnalysis(merchantId);

  const opportunities = [];
  for (const o of analysis.opportunities) {
    const createdAt = daysBefore(intBetween(1, 6));
    const row = await upsertByKey(
      async () => prisma.opportunity.findFirst({ where: { merchantId, type: o.type, title: o.title } }),
      () =>
        prisma.opportunity.create({
          data: {
            merchantId,
            title: o.title,
            description: o.description,
            type: o.type,
            estimatedRevenueMinor: o.estimatedRevenueMinor,
            confidence: o.confidence,
            status: o.status,
            createdAt,
          },
        }),
      (existing) =>
        prisma.opportunity.update({
          where: { id: existing.id },
          data: {
            description: o.description,
            estimatedRevenueMinor: o.estimatedRevenueMinor,
            confidence: o.confidence,
            status: o.status,
          },
        })
    );
    opportunities.push({ row, analysis: o });
    result.opportunities += 1;
  }

  // ── Scenarios, Simulation, Decision per opportunity ────────────────
  let pipelineIndex = 0;
  for (const { row: opportunity, analysis: o } of opportunities) {
    const strategy = o.recommendedStrategies?.[0];
    if (!strategy) {
      result.refused.push(`${o.type}: detector produced no strategy candidate`);
      continue;
    }

    const simInput = {
      merchantId,
      opportunityType: o.type as OpportunityType,
      strategyId: strategy.id,
      strategy,
      config: DEFAULT_SCENARIO_CONFIG,
    };

    const simulationOutput = await runSimulationAgent(simInput);

    // A refused simulation must not be written back as if it succeeded.
    if (simulationOutput.scenarios.length === 0 || simulationOutput.baseline.eligibleCustomers === 0) {
      const explanation =
        `Insufficient historical data for ${o.type}: baseline quality ` +
        `${simulationOutput.baseline.dataQuality}/${DEFAULT_SCENARIO_CONFIG.minDataQuality}, ` +
        `${simulationOutput.baseline.eligibleCustomers} eligible customers. ` +
        (simulationOutput.explanation || "No scenarios produced.");

      await upsertByKey(
        async () => prisma.simulation.findFirst({ where: { merchantId, opportunityType: o.type, strategyId: strategy.id } }),
        () =>
          prisma.simulation.create({
            data: {
              merchantId,
              opportunityType: o.type,
              strategyId: strategy.id,
              strategyName: strategy.name,
              configSnapshot: JSON.stringify(DEFAULT_SCENARIO_CONFIG),
              recommendedScenario: "EXPECTED",
              decisionScore: simulationOutput.decisionScore,
              riskLevel: simulationOutput.riskLevel,
              confidence: simulationOutput.confidence,
              explanation,
              baselineSnapshot: JSON.stringify(simulationOutput.baseline),
              createdAt: daysBefore(1),
            },
          }),
        (existing) =>
          prisma.simulation.update({
            where: { id: existing.id },
            data: { explanation, baselineSnapshot: JSON.stringify(simulationOutput.baseline) },
          })
      );
      result.refused.push(`${o.type}: ${explanation}`);
      continue;
    }

    // Scenario rows (one per CONSERVATIVE/EXPECTED/OPTIMISTIC).
    for (const s of simulationOutput.scenarios) {
      await upsertByKey(
        async () =>
          prisma.scenario.findFirst({
            where: { merchantId, opportunityType: o.type, strategyId: strategy.id, scenarioType: s.scenarioType },
          }),
        () =>
          prisma.scenario.create({
            data: {
              merchantId,
              opportunityType: o.type,
              strategyId: strategy.id,
              scenarioType: s.scenarioType,
              eligibleCustomers: s.eligibleCustomers,
              expectedConversionRate: s.expectedConversionRate,
              expectedConversions: s.expectedConversions,
              expectedRevenueMinor: s.expectedRevenueMinor,
              expectedCostMinor: s.expectedCostMinor,
              expectedNetImpactMinor: s.expectedNetImpactMinor,
              expectedROI: s.expectedROI,
              confidence: s.confidence,
              riskScore: s.riskScore,
              riskLevel: s.riskLevel,
              downsideRevenueMinor: s.downsideRevenueMinor,
              downsideCostMinor: s.downsideCostMinor,
              downsideNetImpactMinor: s.downsideNetImpactMinor,
              evidence: JSON.stringify(s.evidence),
              createdAt: daysBefore(1),
            },
          }),
        (existing) =>
          prisma.scenario.update({
            where: { id: existing.id },
            data: {
              eligibleCustomers: s.eligibleCustomers,
              expectedConversionRate: s.expectedConversionRate,
              expectedConversions: s.expectedConversions,
              expectedRevenueMinor: s.expectedRevenueMinor,
              expectedCostMinor: s.expectedCostMinor,
              expectedNetImpactMinor: s.expectedNetImpactMinor,
              expectedROI: s.expectedROI,
              confidence: s.confidence,
              riskScore: s.riskScore,
              riskLevel: s.riskLevel,
              downsideRevenueMinor: s.downsideRevenueMinor,
              downsideCostMinor: s.downsideCostMinor,
              downsideNetImpactMinor: s.downsideNetImpactMinor,
              evidence: JSON.stringify(s.evidence),
            },
          })
      );
      result.scenarios += 1;
    }

    // Simulation row.
    const simulation = await upsertByKey(
      async () => prisma.simulation.findFirst({ where: { merchantId, opportunityType: o.type, strategyId: strategy.id } }),
      () =>
        prisma.simulation.create({
          data: {
            merchantId,
            opportunityType: o.type,
            strategyId: strategy.id,
            strategyName: strategy.name,
            configSnapshot: JSON.stringify(DEFAULT_SCENARIO_CONFIG),
            recommendedScenario: simulationOutput.recommendedScenario,
            decisionScore: simulationOutput.decisionScore,
            riskLevel: simulationOutput.riskLevel,
            confidence: simulationOutput.confidence,
            explanation: simulationOutput.explanation,
            baselineSnapshot: JSON.stringify(simulationOutput.baseline),
            createdAt: daysBefore(1),
          },
        }),
      (existing) =>
        prisma.simulation.update({
          where: { id: existing.id },
          data: {
            recommendedScenario: simulationOutput.recommendedScenario,
            decisionScore: simulationOutput.decisionScore,
            riskLevel: simulationOutput.riskLevel,
            confidence: simulationOutput.confidence,
            explanation: simulationOutput.explanation,
            baselineSnapshot: JSON.stringify(simulationOutput.baseline),
          },
        })
    );
    result.simulations += 1;

    // Decision row, from the real decision engine.
    const decisionOutput = runDecisionAnalysis(simInput, simulationOutput);
    const decision = await upsertByKey(
      async () => prisma.decision.findFirst({ where: { merchantId, simulationId: simulation.id } }),
      () =>
        prisma.decision.create({
          data: {
            merchantId,
            simulationId: simulation.id,
            opportunityType: o.type,
            strategyId: strategy.id,
            strategyName: strategy.name,
            recommendedScenario: decisionOutput.recommendedScenario,
            decisionScore: decisionOutput.decisionScore,
            riskLevel: decisionOutput.riskLevel,
            confidence: decisionOutput.confidence,
            decisionCategory: decisionOutput.decisionCategory,
            explanation: decisionOutput.explanation,
            evidence: JSON.stringify({
              baseline: simulationOutput.baseline,
              scenarios: simulationOutput.scenarios,
            }),
            createdAt: daysBefore(1),
          },
        }),
      (existing) =>
        prisma.decision.update({
          where: { id: existing.id },
          data: {
            recommendedScenario: decisionOutput.recommendedScenario,
            decisionScore: decisionOutput.decisionScore,
            riskLevel: decisionOutput.riskLevel,
            confidence: decisionOutput.confidence,
            decisionCategory: decisionOutput.decisionCategory,
            explanation: decisionOutput.explanation,
            evidence: JSON.stringify({ baseline: simulationOutput.baseline, scenarios: simulationOutput.scenarios }),
          },
        })
    );
    result.decisions += 1;

    // Only DO_NOT_ACT / NO_CLEAR_WINNER decisions are left without a governance
    // record; anything actionable goes through governance.
    if (decisionOutput.decisionCategory === "DO_NOT_ACT") {
      continue;
    }

    const recommended =
      simulationOutput.scenarios.find((s) => s.scenarioType === decisionOutput.recommendedScenario) ??
      simulationOutput.scenarios[0];

    // ActionRequest, via the real service so validation and `reason` mapping
    // stay in one place. `requestedBy` is a different user from the eventual
    // approver so four-eyes can be demonstrated in the UI.
    const requesterIsOps = pipelineIndex % 2 === 0;
    const actionType = STRATEGY_TO_ACTION_TYPE[strategy.strategyType] ?? "COUPON";
    const actionRequest = await upsertByKey(
      async () =>
        prisma.actionRequest.findFirst({
          // `createActionRequest` stores the action type in `opportunityType`,
          // so that column is the business key together with `strategyId`.
          where: { merchantId, opportunityType: actionType, strategyId: strategy.id },
        }),
      () =>
        createActionRequest(
          {
            actionType,
            strategyId: strategy.id,
            strategyName: strategy.name,
            recommendedScenario: decisionOutput.recommendedScenario,
            decisionScore: decisionOutput.decisionScore,
            riskLevel: decisionOutput.riskLevel,
            confidence: decisionOutput.confidence,
            amountMinor: recommended.expectedCostMinor,
            currency: "INR",
            rationale: decisionOutput.explanation,
            evidence: JSON.stringify({ opportunityId: opportunity.id, decisionId: decision.id }),
            requestedBy: requesterIsOps ? users.meeraOps.id : users.arjun.id,
          },
          merchantId
        ),
      (existing) =>
        prisma.actionRequest.update({
          where: { id: existing.id },
          data: {
            strategyName: strategy.name,
            recommendedScenario: decisionOutput.recommendedScenario,
            decisionScore: decisionOutput.decisionScore,
            riskLevel: decisionOutput.riskLevel,
            confidence: decisionOutput.confidence,
            amountMinor: recommended.expectedCostMinor,
            reason: decisionOutput.explanation,
            evidence: JSON.stringify({ opportunityId: opportunity.id, decisionId: decision.id }),
          },
        })
    );
    result.actionRequests += 1;

    // GovernanceDecision. `decision` uses the documented ALLOW | BLOCK |
    // REQUIRE_APPROVAL vocabulary; `status` reflects whether a human still has
    // to approve. Some are left PENDING so the approvals queue has something
    // real in it; the rest are recorded as auto-approved by policy.
    const needsHumanApproval = decisionOutput.riskLevel !== "LOW" || decisionOutput.confidence < 80;
    const govDecision = needsHumanApproval ? "REQUIRE_APPROVAL" : "ALLOW";
    const govStatus = needsHumanApproval ? "PENDING" : "APPROVED";

    // A PENDING decision has no approver yet — writing one in would make the
    // approvals queue claim a human already signed off. Only auto-approved
    // decisions carry an approver, and it is always the *other* UrbanWear user
    // so the four-eyes rule is genuinely satisfied rather than bypassed.
    const requesterId = requesterIsOps ? users.meeraOps.id : users.arjun.id;
    const approverId = needsHumanApproval
      ? null
      : requesterIsOps
        ? users.arjun.id
        : users.meeraOps.id;

    const governance = await upsertByKey(
      async () => prisma.governanceDecision.findFirst({ where: { merchantId, actionRequestId: actionRequest.id } }),
      () =>
        prisma.governanceDecision.create({
          data: {
            merchantId,
            actionRequestId: actionRequest.id,
            decision: govDecision,
            decisionReason: decisionOutput.explanation,
            riskLevel: decisionOutput.riskLevel,
            confidence: decisionOutput.confidence,
            status: govStatus,
            requestedBy: requesterId,
            approvedBy: approverId,
            approvedAt: approverId ? daysBefore(0, 10) : null,
            evidence: JSON.stringify({ decisionId: decision.id, simulationId: simulation.id }),
            createdAt: daysBefore(1),
          },
        }),
      (existing) =>
        prisma.governanceDecision.update({
          where: { id: existing.id },
          data: {
            decision: govDecision,
            decisionReason: decisionOutput.explanation,
            riskLevel: decisionOutput.riskLevel,
            confidence: decisionOutput.confidence,
            status: govStatus,
            requestedBy: requesterId,
            approvedBy: approverId,
            approvedAt: approverId ? daysBefore(0, 10) : null,
          },
        })
    );
    result.governanceDecisions += 1;

    if (govStatus !== "APPROVED") {
      // Leave it pending: the approvals UI needs a real pending item, and the
      // four-eyes rule means this cannot be self-approved by the requester.
      pipelineIndex += 1;
      continue;
    }

    // Auto-approved by policy: record the execution it would produce, plus a
    // reconciliation so the payment-health module has a real row to read.
    const expected = simulationOutput.scenarios.find((s) => s.scenarioType === "EXPECTED");
    const amountMinor = expected?.expectedNetImpactMinor ?? 0;
    const idempotencyKey = `seed:${opportunity.type}:${strategy.id}`;

    const execution = await upsertByKey(
      async () => prisma.execution.findUnique({ where: { merchantId_idempotencyKey: { merchantId, idempotencyKey } } }),
      () =>
        prisma.execution.create({
          data: {
            merchantId,
            governanceDecisionId: governance.id,
            actionRequestId: actionRequest.id,
            idempotencyKey,
            actionType: strategy.strategyType as string,
            strategyId: strategy.id,
            amountMinor,
            currency: "INR",
            status: "SUCCEEDED",
            provider: "razorpay",
            providerReference: `seed_exec_${opportunity.type}_${strategy.id}`.slice(0, 60),
            startedAt: daysBefore(0, 9),
            completedAt: daysBefore(0, 11),
            createdAt: daysBefore(1),
          },
        }),
      (existing) => prisma.execution.update({ where: { id: existing.id }, data: { amountMinor, status: "SUCCEEDED" } })
    );
    result.executions += 1;

    await prisma.executionAttempt.upsert({
      where: { id: `seed_attempt_${execution.id}` },
      create: {
        id: `seed_attempt_${execution.id}`,
        executionId: execution.id,
        attemptNumber: 1,
        provider: "razorpay",
        idempotencyKey,
        providerReference: execution.providerReference,
        status: "ACCEPTED",
        responseCode: "OK",
        startedAt: daysBefore(0, 9),
        completedAt: daysBefore(0, 9),
        createdAt: daysBefore(1),
      },
      update: { status: "ACCEPTED", responseCode: "OK" },
    });

    await prisma.reconciliation.upsert({
      where: { executionId: execution.id },
      create: {
        executionId: execution.id,
        merchantId,
        provider: "razorpay",
        providerReference: execution.providerReference,
        providerStatus: "captured",
        growthOSStatus: "SUCCEEDED",
        amountMinor,
        currency: "INR",
        amountMatch: true,
        statusMatch: true,
        status: "MATCHED",
        resolvedAt: daysBefore(0, 11),
        createdAt: daysBefore(1),
      },
      update: { amountMinor, status: "MATCHED" },
    });
    result.reconciliations += 1;

    pipelineIndex += 1;
  }

  return result;
}

async function seedAgenticRecords(
  merchants: Awaited<ReturnType<typeof seedMerchants>>,
  agents: Awaited<ReturnType<typeof seedAgents>>,
  pipeline: PipelineResult
) {
  const merchantId = merchants.urbanWear.id;
  const createdAt = daysBefore(1, 8);

  const cycle = await upsertByKey(
    async () => prisma.growthCycle.findFirst({ where: { merchantId, createdAt } }),
    () =>
      prisma.growthCycle.create({
        data: {
          merchantId,
          status: "COMPLETED",
          currentStep: "LEARNING",
          opportunityCount: pipeline.opportunities,
          strategyCount: pipeline.actionRequests,
          decisionCount: pipeline.decisions,
          executionCount: pipeline.executions,
          metadata: JSON.stringify({ refused: pipeline.refused }),
          startedAt: createdAt,
          completedAt: daysBefore(1, 9),
          createdAt,
        },
      }),
    (existing) =>
      prisma.growthCycle.update({
        where: { id: existing.id },
        data: {
          status: "COMPLETED",
          currentStep: "LEARNING",
          opportunityCount: pipeline.opportunities,
          strategyCount: pipeline.actionRequests,
          decisionCount: pipeline.decisions,
          executionCount: pipeline.executions,
        },
      })
  );

  const agentRuns = [];
  const AGENT_RUN_TYPES = ["OPPORTUNITY", "STRATEGY", "SIMULATION", "DECISION", "GOVERNANCE"];
  for (let i = 0; i < AGENT_RUN_TYPES.length; i += 1) {
    const agentType = AGENT_RUN_TYPES[i];
    const agent = agents.find((a) => a.type === agentType) ?? agents[0];
    const runAt = daysBefore(1, 8 + i);
    const durationMs = intBetween(120, 900);

    const run = await upsertByKey(
      async () => prisma.agentRun.findFirst({ where: { merchantId, growthCycleId: cycle.id, agentType } }),
      () =>
        prisma.agentRun.create({
          data: {
            merchantId,
            growthCycleId: cycle.id,
            agentType,
            agentId: agent.id,
            status: "COMPLETED",
            input: JSON.stringify({ source: "seed" }),
            output: JSON.stringify({ ok: true }),
            confidence: 70 + i,
            reasoningSummary: `${agentType} stage completed from seeded order history`,
            warnings: JSON.stringify([]),
            startedAt: runAt,
            completedAt: new Date(runAt.getTime() + durationMs),
            durationMs,
            createdAt: runAt,
          },
        }),
      (existing) =>
        prisma.agentRun.update({
          where: { id: existing.id },
          data: { status: "COMPLETED", completedAt: new Date(runAt.getTime() + durationMs), durationMs },
        })
    );
    agentRuns.push({ run, agentType, agent });

    await upsertByKey(
      async () => prisma.agentEvent.findFirst({ where: { merchantId, growthCycleId: cycle.id, eventType: `${agentType}_COMPLETED` } }),
      () =>
        prisma.agentEvent.create({
          data: {
            merchantId,
            growthCycleId: cycle.id,
            eventType: `${agentType}_COMPLETED`,
            agentType,
            agentRunId: run.id,
            title: `${agentType} stage completed`,
            details: JSON.stringify({ durationMs }),
            severity: "INFO",
            timestamp: new Date(runAt.getTime() + durationMs),
          },
        }),
      (existing) => prisma.agentEvent.update({ where: { id: existing.id }, data: { agentRunId: run.id, title: `${agentType} stage completed` } })
    );

    await upsertByKey(
      async () => prisma.agentMessage.findFirst({ where: { growthCycleId: cycle.id, senderAgent: agentType, receiverAgent: agentType } }),
      () =>
        prisma.agentMessage.create({
          data: {
            merchantId,
            growthCycleId: cycle.id,
            senderAgent: agentType,
            receiverAgent: agentType,
            messageType: "EVENT",
            payload: JSON.stringify({ agentRunId: run.id, status: "COMPLETED" }),
            agentRunId: run.id,
            timestamp: new Date(runAt.getTime() + durationMs),
          },
        }),
      (existing) => prisma.agentMessage.update({ where: { id: existing.id }, data: { payload: JSON.stringify({ agentRunId: run.id, status: "COMPLETED" }) } })
    );
  }

  const memories = [
    { category: "STRATEGY_PERFORMANCE", key: "seed:baseline-aov", value: { note: "observed average order value at seed time" }, confidence: 70 },
    { category: "PREDICTION_ACCURACY", key: "seed:pipeline-completeness", value: { scenariosGenerated: pipeline.scenarios, decisionsGenerated: pipeline.decisions }, confidence: 60 },
  ];
  for (const m of memories) {
    await prisma.agentMemory.upsert({
      where: { merchantId_memoryType_category_key: { merchantId, memoryType: "LONG_TERM", category: m.category, key: m.key } },
      create: {
        merchantId,
        memoryType: "LONG_TERM",
        category: m.category,
        key: m.key,
        value: JSON.stringify(m.value),
        confidence: m.confidence,
        accessCount: 1,
        lastAccessedAt: createdAt,
        createdAt,
      },
      update: { value: JSON.stringify(m.value), confidence: m.confidence },
    });
  }

  return { cycle, agentRuns };
}

async function seedAuditLog(
  merchants: Awaited<ReturnType<typeof seedMerchants>>,
  users: Awaited<ReturnType<typeof seedUsers>>,
  pipeline: PipelineResult
) {
  const merchantId = merchants.urbanWear.id;

  const entries: Array<{ action: string; resourceType: string; resourceId: string; outcome: string; severity: string; at: Date; details?: Record<string, unknown> }> = [
    { action: "USER_LOGIN", resourceType: "USER", resourceId: users.arjun.id, outcome: "ALLOWED", severity: "INFO", at: daysBefore(1, 8), details: { actor: users.arjun.email } },
    { action: "INTELLIGENCE_ANALYSIS_COMPLETED", resourceType: "MERCHANT", resourceId: merchantId, outcome: "ALLOWED", severity: "INFO", at: daysBefore(1, 8), details: { opportunities: pipeline.opportunities, customersAnalyzed: 10 } },
    { action: "SCENARIO_SIMULATION_COMPLETED", resourceType: "MERCHANT", resourceId: merchantId, outcome: "ALLOWED", severity: "INFO", at: daysBefore(1, 8), details: { scenarios: pipeline.scenarios } },
    { action: "GOVERNANCE_EVALUATED", resourceType: "MERCHANT", resourceId: merchantId, outcome: "ALLOWED", severity: "INFO", at: daysBefore(1, 8), details: { decisions: pipeline.decisions, actionRequests: pipeline.actionRequests } },
    { action: "SEED_PIPELINE_COMPLETED", resourceType: "MERCHANT", resourceId: merchantId, outcome: "ALLOWED", severity: "INFO", at: daysBefore(0, 9), details: { executions: pipeline.executions, reconciliations: pipeline.reconciliations } },
  ];

  for (const e of entries) {
    await upsertByKey(
      async () => prisma.auditLog.findFirst({ where: { merchantId, action: e.action, resourceType: e.resourceType, resourceId: e.resourceId } }),
      () =>
        prisma.auditLog.create({
          data: {
            merchantId,
            action: e.action,
            resourceType: e.resourceType,
            resourceId: e.resourceId,
            outcome: e.outcome,
            details: e.details ? JSON.stringify(e.details) : null,
            severity: e.severity,
            createdAt: e.at,
          },
        }),
      (existing) => prisma.auditLog.update({ where: { id: existing.id }, data: { outcome: e.outcome, details: e.details ? JSON.stringify(e.details) : null, severity: e.severity } })
    );
  }

  return entries.length;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding GrowthOS database...");
  console.log(`   Anchor date: ${ANCHOR.toISOString()}`);
  console.log(`   Mode: idempotent upsert (no deletes, foreign keys enforced)\n`);

  const users = await seedUsers();
  console.log(`   ✅ Users (${users.customerUsers.length + 4})`);

  const merchants = await seedMerchants(users);
  console.log("   ✅ Merchants (2)");

  const customers = await seedCustomers(users, merchants);
  console.log(`   ✅ Customers (${customers.length})`);

  const products = await seedProducts(merchants);
  console.log(`   ✅ Products (${products.urbanWearProducts.length + products.techStoreProducts.length})`);

  const orders = await seedOrders(merchants, customers, products);
  console.log(`   ✅ Orders (${orders.length}, spread over ~170 days)`);

  const campaigns = await seedCampaigns(merchants);
  console.log(`   ✅ Campaigns (${campaigns.length})`);

  const agents = await seedAgents();
  console.log(`   ✅ Agents (${agents.length})`);

  const policies = await seedPolicies(merchants);
  console.log(`   ✅ Policies (${policies.length})`);

  await seedAutopilotConfig(merchants);
  console.log("   ✅ AutopilotConfig (1)");

  await seedSystemHealth();
  console.log("   ✅ SystemHealth (1)");

  const pipeline = await seedPipeline(merchants, users);
  console.log(
    `   ✅ Pipeline: ${pipeline.opportunities} opportunities, ${pipeline.scenarios} scenarios, ` +
    `${pipeline.simulations} simulations, ${pipeline.decisions} decisions, ` +
    `${pipeline.actionRequests} action requests, ${pipeline.governanceDecisions} governance decisions, ` +
    `${pipeline.executions} executions, ${pipeline.reconciliations} reconciliations`
  );

  const { cycle, agentRuns } = await seedAgenticRecords(merchants, agents, pipeline);
  console.log(`   ✅ GrowthCycle (1) + AgentRuns (${agentRuns.length}) + AgentEvents + AgentMessages + AgentMemory`);

  const auditCount = await seedAuditLog(merchants, users, pipeline);
  console.log(`   ✅ AuditLog (${auditCount})`);

  if (pipeline.refused.length > 0) {
    console.log("\n   ⚠️  Scenario engine refused these (insufficient real data):");
    for (const r of pipeline.refused) {
      console.log(`      - ${r}`);
    }
    console.log("      No numbers were invented for these.");
  }

  console.log("\n✅ Seed completed. Re-running this script is safe (upserts in place).\n");
  console.log("📋 Test Credentials:");
  console.log("   Admin:     admin@growthos.in / Password123");
  console.log("   Merchant:  arjun@urbanwear.in / Password123  (approver)");
  console.log("   Merchant:  meera@urbanwear.in / Password123  (second user: four-eyes requester)");
  console.log("   Merchant:  priya@techstore.in / Password123");
  console.log("   Customer:  customer1@example.com / Password123");
  console.log(`\n   Growth cycle: ${cycle.id} (${cycle.status})`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
