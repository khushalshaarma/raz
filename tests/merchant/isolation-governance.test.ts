import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { POST as approve } from "@/app/api/merchant/governance/approvals/[id]/approve/route";
import { POST as reject } from "@/app/api/merchant/governance/approvals/[id]/reject/route";
import { GET as getPolicy, PUT as putPolicy } from "@/app/api/policies/[id]/route";
import { POST as togglePolicy } from "@/app/api/policies/[id]/toggle/route";
import { getOpportunityDetail, getMerchantOpportunities } from "@/lib/product/opportunity-center";
import { createActionRequest, validateActionRequest } from "@/lib/governance/action";

/**
 * Merchant-isolation and correctness regression tests.
 *
 * Every case here corresponds to a confirmed defect where a lookup was done by
 * bare id, or where a value convention mismatch made real data invisible.
 */

const userIds: string[] = [];
const merchantIds: string[] = [];

async function createUser(role: "MERCHANT" | "CUSTOMER" | "ADMIN" = "MERCHANT") {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: { email: `iso-${stamp}@test.com`, password: "hash", name: "Iso", role },
  });
  userIds.push(user.id);
  return user;
}

async function createMerchant(ownerId: string, label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const merchant = await prisma.merchant.create({
    data: { ownerId, businessName: label, email: `${label}-${stamp}@test.com` },
  });
  merchantIds.push(merchant.id);
  return merchant;
}

function request(url: string, token: string) {
  const req = new NextRequest(url);
  req.cookies.set("growthos_token", token);
  return req;
}

/** A pending decision plus the action request it governs. */
async function createPendingDecision(merchantId: string) {
  const actionRequest = await prisma.actionRequest.create({
    data: {
      merchantId,
      opportunityType: "DISCOUNT",
      strategyId: "strat-1",
      strategyName: "Autumn discount",
      recommendedScenario: "EXPECTED",
      decisionScore: 70,
      riskLevel: "MEDIUM",
      confidence: 70,
      status: "PENDING",
      amountMinor: 125000,
    },
  });
  const decision = await prisma.governanceDecision.create({
    data: {
      merchantId,
      actionRequestId: actionRequest.id,
      decision: "REQUIRE_APPROVAL",
      decisionReason: "Requires approval: risk 55/100",
      riskLevel: "MEDIUM",
      confidence: 70,
      status: "PENDING",
    },
  });
  return { actionRequest, decision };
}

beforeEach(() => {
  userIds.length = 0;
  merchantIds.length = 0;
});

afterEach(async () => {
  if (merchantIds.length) {
    const ids = { in: merchantIds };

    // Delete in FK-dependency order, children first.
    await prisma.auditLog.deleteMany({ where: { merchantId: ids } });
    await prisma.execution.deleteMany({ where: { merchantId: ids } });
    await prisma.governanceDecision.deleteMany({ where: { merchantId: ids } });
    await prisma.actionRequest.deleteMany({ where: { merchantId: ids } });
    await prisma.opportunity.deleteMany({ where: { merchantId: ids } });
    await prisma.policy.deleteMany({ where: { merchantId: ids } });
    await prisma.merchant.deleteMany({ where: { id: ids } });
    merchantIds.length = 0;
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
  }
});

describe("approvals: merchant isolation", () => {
  it("refuses to let one merchant approve another merchant's decision", async () => {
    const victimUser = await createUser();
    const attackerUser = await createUser();
    const victim = await createMerchant(victimUser.id, "Victim");
    const attacker = await createMerchant(attackerUser.id, "Attacker");
    const { decision } = await createPendingDecision(victim.id);

    const token = await signToken({
      userId: attackerUser.id,
      email: attackerUser.email,
      role: "MERCHANT",
      merchantId: attacker.id,
    });

    const res = await approve(
      request(`http://localhost/api/merchant/governance/approvals/${decision.id}/approve`, token),
      { params: Promise.resolve({ id: decision.id }) }
    );

    expect(res.status).toBe(404);
    // The victim's decision must be untouched.
    const after = await prisma.governanceDecision.findUnique({ where: { id: decision.id } });
    expect(after?.status).toBe("PENDING");
  });

  it("refuses to let one merchant reject another merchant's decision", async () => {
    const victimUser = await createUser();
    const attackerUser = await createUser();
    const victim = await createMerchant(victimUser.id, "Victim");
    const attacker = await createMerchant(attackerUser.id, "Attacker");
    const { decision } = await createPendingDecision(victim.id);

    const token = await signToken({
      userId: attackerUser.id,
      email: attackerUser.email,
      role: "MERCHANT",
      merchantId: attacker.id,
    });

    const res = await reject(
      request(`http://localhost/api/merchant/governance/approvals/${decision.id}/reject`, token),
      { params: Promise.resolve({ id: decision.id }) }
    );

    expect(res.status).toBe(404);
    const after = await prisma.governanceDecision.findUnique({ where: { id: decision.id } });
    expect(after?.status).toBe("PENDING");
  });
});

describe("approvals: identifier resolution", () => {
  it("accepts the ActionRequest id, which is what the approvals UI sends", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const { actionRequest, decision } = await createPendingDecision(merchant.id);

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: "MERCHANT",
      merchantId: merchant.id,
    });

    // The UI lists action requests, so it passes actionRequest.id.
    const res = await approve(
      request(`http://localhost/api/merchant/governance/approvals/${actionRequest.id}/approve`, token),
      { params: Promise.resolve({ id: actionRequest.id }) }
    );

    expect(res.status).toBe(200);
    const after = await prisma.governanceDecision.findUnique({ where: { id: decision.id } });
    expect(after?.status).toBe("APPROVED");
    expect(after?.approvedBy).toBe(user.id);

    const ar = await prisma.actionRequest.findUnique({ where: { id: actionRequest.id } });
    expect(ar?.status).toBe("APPROVED");
  });

  it("still accepts a GovernanceDecision id", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const { decision } = await createPendingDecision(merchant.id);

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: "MERCHANT",
      merchantId: merchant.id,
    });

    const res = await approve(
      request(`http://localhost/api/merchant/governance/approvals/${decision.id}/approve`, token),
      { params: Promise.resolve({ id: decision.id }) }
    );

    expect(res.status).toBe(200);
  });

  it("does not flip the action request when the decision is already processed", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const { actionRequest, decision } = await createPendingDecision(merchant.id);
    await prisma.governanceDecision.update({
      where: { id: decision.id },
      data: { status: "APPROVED" },
    });

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: "MERCHANT",
      merchantId: merchant.id,
    });

    const res = await approve(
      request(`http://localhost/api/merchant/governance/approvals/${actionRequest.id}/approve`, token),
      { params: Promise.resolve({ id: actionRequest.id }) }
    );

    expect(res.status).toBe(400);
    const ar = await prisma.actionRequest.findUnique({ where: { id: actionRequest.id } });
    expect(ar?.status).toBe("PENDING");
  });

  it("blocks a second approval of an already-approved decision (four-eyes)", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const { actionRequest, decision } = await createPendingDecision(merchant.id);
    await prisma.governanceDecision.update({
      where: { id: decision.id },
      data: { status: "APPROVED", approvedBy: user.id },
    });

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: "MERCHANT",
      merchantId: merchant.id,
    });

    const res = await approve(
      request(`http://localhost/api/merchant/governance/approvals/${actionRequest.id}/approve`, token),
      { params: Promise.resolve({ id: actionRequest.id }) }
    );

    // 400 (not pending) fires before the four-eyes check; the decision must
    // remain approved and the action request untouched.
    expect(res.status).toBe(400);
    const ar = await prisma.actionRequest.findUnique({ where: { id: actionRequest.id } });
    expect(ar?.status).toBe("PENDING");
  });

  it("records the approver's rejection reason and does not fake a policy BLOCK", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const { actionRequest, decision } = await createPendingDecision(merchant.id);

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: "MERCHANT",
      merchantId: merchant.id,
    });

    const req = request(
      `http://localhost/api/merchant/governance/approvals/${actionRequest.id}/reject`,
      token
    );
    // simulate a body-bearing request
    const withBody = new NextRequest(req.url, { method: "POST" });
    withBody.cookies.set("growthos_token", token);
    await withBody.text().catch(() => "");
    Object.defineProperty(withBody, "json", {
      value: async () => ({ reason: "Margin too thin" }),
    });

    const res = await reject(withBody, { params: Promise.resolve({ id: actionRequest.id }) });

    expect(res.status).toBe(200);
    const after = await prisma.governanceDecision.findUnique({ where: { id: decision.id } });
    expect(after?.status).toBe("BLOCKED");
    expect(after?.decisionReason).toBe("Margin too thin");
    // A human rejection must NOT be recorded as a policy block, otherwise the
    // dashboard's GOVERNANCE_BLOCK alert misreports it.
    expect(after?.decision).toBe("REQUIRE_APPROVAL");
  });

  it("requires authentication", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const { decision } = await createPendingDecision(merchant.id);

    const res = await approve(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: decision.id }),
    });
    expect(res.status).toBe(401);
  });
});

describe("policies: ownership enforcement", () => {
  async function createPolicy(merchantId: string, name = "Spend cap") {
    return prisma.policy.create({
      data: {
        merchantId,
        name,
        conditionType: "SPEND",
        conditionOperator: "LTE",
        conditionValue: 500000,
        action: "REQUIRE_APPROVAL",
      },
    });
  }

  it("does not let one merchant read another's policy", async () => {
    const victimUser = await createUser();
    const attackerUser = await createUser();
    const victim = await createMerchant(victimUser.id, "Victim");
    const attacker = await createMerchant(attackerUser.id, "Attacker");
    const policy = await createPolicy(victim.id);

    const token = await signToken({
      userId: attackerUser.id,
      email: attackerUser.email,
      role: "MERCHANT",
      merchantId: attacker.id,
    });

    const res = await getPolicy(request(`http://localhost/api/policies/${policy.id}`, token), {
      params: Promise.resolve({ id: policy.id }),
    });
    expect(res.status).toBe(404);
  });

  it("does not let one merchant update another's policy", async () => {
    const victimUser = await createUser();
    const attackerUser = await createUser();
    const victim = await createMerchant(victimUser.id, "Victim");
    const attacker = await createMerchant(attackerUser.id, "Attacker");
    const policy = await createPolicy(victim.id);

    const token = await signToken({
      userId: attackerUser.id,
      email: attackerUser.email,
      role: "MERCHANT",
      merchantId: attacker.id,
    });

    const req = new NextRequest(`http://localhost/api/policies/${policy.id}`, {
      method: "PUT",
      body: JSON.stringify({ conditionValue: 1 }),
    });
    req.cookies.set("growthos_token", token);

    const res = await putPolicy(req, { params: Promise.resolve({ id: policy.id }) });
    expect(res.status).toBe(404);

    const after = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(after?.conditionValue).toBe(500000);
  });

  it("does not let a CUSTOMER-role session touch policies", async () => {
    const owner = await createUser();
    const customer = await createUser("CUSTOMER");
    const merchant = await createMerchant(owner.id, "Owner");
    const policy = await createPolicy(merchant.id);

    const token = await signToken({
      userId: customer.id,
      email: customer.email,
      role: "CUSTOMER",
    });

    const res = await getPolicy(request(`http://localhost/api/policies/${policy.id}`, token), {
      params: Promise.resolve({ id: policy.id }),
    });
    expect(res.status).toBe(403);
  });

  it("does not let one merchant toggle another's policy", async () => {
    const victimUser = await createUser();
    const attackerUser = await createUser();
    const victim = await createMerchant(victimUser.id, "Victim");
    const attacker = await createMerchant(attackerUser.id, "Attacker");
    const policy = await createPolicy(victim.id);

    const token = await signToken({
      userId: attackerUser.id,
      email: attackerUser.email,
      role: "MERCHANT",
      merchantId: attacker.id,
    });

    const req = new NextRequest(`http://localhost/api/policies/${policy.id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ isActive: false }),
    });
    req.cookies.set("growthos_token", token);

    const res = await togglePolicy(req, { params: Promise.resolve({ id: policy.id }) });
    expect(res.status).toBe(404);

    const after = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(after?.isActive).toBe(true);
  });

  it("lets the owning merchant update and toggle its own policy", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const policy = await createPolicy(merchant.id);

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: "MERCHANT",
      merchantId: merchant.id,
    });

    const putReq = new NextRequest(`http://localhost/api/policies/${policy.id}`, {
      method: "PUT",
      body: JSON.stringify({ conditionValue: 250000 }),
    });
    putReq.cookies.set("growthos_token", token);
    const putRes = await putPolicy(putReq, { params: Promise.resolve({ id: policy.id }) });
    expect(putRes.status).toBe(200);

    const toggleReq = new NextRequest(`http://localhost/api/policies/${policy.id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ isActive: false }),
    });
    toggleReq.cookies.set("growthos_token", token);
    const toggleRes = await togglePolicy(toggleReq, { params: Promise.resolve({ id: policy.id }) });
    expect(toggleRes.status).toBe(200);

    const after = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(after?.conditionValue).toBe(250000);
    expect(after?.isActive).toBe(false);
  });
});

describe("opportunity center: related actions must not leak across merchants", () => {
  it("excludes other merchants' action requests from the opportunity detail", async () => {
    const aUser = await createUser();
    const bUser = await createUser();
    const a = await createMerchant(aUser.id, "Alpha");
    const b = await createMerchant(bUser.id, "Bravo");

    const opp = await prisma.opportunity.create({
      data: {
        merchantId: a.id,
        title: "Inactive customers",
        description: "Many inactive customers",
        type: "INACTIVE_CUSTOMERS",
        estimatedRevenueMinor: 2500000,
        confidence: 84,
        status: "DETECTED",
      },
    });

    // Both merchants act on the SAME opportunityType. Only Alpha's may appear.
    await prisma.actionRequest.create({
      data: {
        merchantId: a.id,
        opportunityType: "INACTIVE_CUSTOMERS",
        strategyId: "alpha-strategy",
        strategyName: "Alpha win-back",
        recommendedScenario: "EXPECTED",
        decisionScore: 70,
        riskLevel: "LOW",
        confidence: 70,
        status: "PENDING",
        amountMinor: 100000,
      },
    });
    await prisma.actionRequest.create({
      data: {
        merchantId: b.id,
        opportunityType: "INACTIVE_CUSTOMERS",
        strategyId: "bravo-strategy",
        strategyName: "Bravo secret campaign",
        recommendedScenario: "OPTIMISTIC",
        decisionScore: 90,
        riskLevel: "HIGH",
        confidence: 90,
        status: "PENDING",
        amountMinor: 900000,
      },
    });

    const detail = await getOpportunityDetail(a.id, opp.id);
    expect(detail).not.toBeNull();
    expect(detail!.actionCount).toBe(1);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("Bravo secret campaign");
    expect(serialized).not.toContain("bravo-strategy");
  });

  it("excludes other merchants' related actions from the opportunity list", async () => {
    const aUser = await createUser();
    const bUser = await createUser();
    const a = await createMerchant(aUser.id, "Alpha");
    const b = await createMerchant(bUser.id, "Bravo");

    await prisma.opportunity.create({
      data: {
        merchantId: a.id,
        title: "Cart abandonment",
        description: "Abandoned carts",
        type: "CART_ABANDONMENT",
        estimatedRevenueMinor: 1000000,
        confidence: 60,
        status: "DETECTED",
      },
    });

    await prisma.actionRequest.create({
      data: {
        merchantId: a.id,
        opportunityType: "CART_ABANDONMENT",
        strategyId: "alpha-strategy",
        strategyName: "Alpha cart recovery",
        recommendedScenario: "EXPECTED",
        decisionScore: 70,
        riskLevel: "LOW",
        confidence: 70,
        status: "PENDING",
        amountMinor: 100000,
      },
    });
    await prisma.actionRequest.create({
      data: {
        merchantId: b.id,
        opportunityType: "CART_ABANDONMENT",
        strategyId: "bravo-strategy",
        strategyName: "Bravo hidden strategy",
        recommendedScenario: "OPTIMISTIC",
        decisionScore: 90,
        riskLevel: "HIGH",
        confidence: 90,
        status: "PENDING",
        amountMinor: 900000,
      },
    });

    const list = await getMerchantOpportunities(a.id, {});
    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain("Bravo hidden strategy");
    expect(serialized).toContain("Alpha cart recovery");
  });

  it("renders the stored confidence without multiplying by 100", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    const opp = await prisma.opportunity.create({
      data: {
        merchantId: merchant.id,
        title: "Upsell",
        description: "Upsell opportunity",
        type: "UPSELL",
        estimatedRevenueMinor: 500000,
        confidence: 84,
        status: "DETECTED",
      },
    });

    const detail = await getOpportunityDetail(merchant.id, opp.id);
    const detected = detail!.timeline.find((t) => t.event === "Opportunity Detected");
    expect(detected?.detail).toContain("84%");
    expect(detected?.detail).not.toContain("8400%");
  });

  it("returns null for another merchant's opportunity id", async () => {
    const aUser = await createUser();
    const bUser = await createUser();
    const a = await createMerchant(aUser.id, "Alpha");
    const b = await createMerchant(bUser.id, "Bravo");
    const opp = await prisma.opportunity.create({
      data: {
        merchantId: a.id,
        title: "Low conversion",
        description: "Low conversion",
        type: "LOW_CONVERSION",
        estimatedRevenueMinor: 1000,
        confidence: 50,
        status: "DETECTED",
      },
    });

    expect(await getOpportunityDetail(b.id, opp.id)).toBeNull();
  });
});

describe("createActionRequest", () => {
  it("creates a request with a rationale instead of failing on an unknown field", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");

    // Previously the insert spread `rationale`, which is not a column on
    // ActionRequest (the column is `reason`), so Prisma rejected the write.
    const result = await createActionRequest(
      {
        actionType: "DISCOUNT",
        strategyId: "strat-42",
        amountMinor: 250000,
        currency: "INR",
        rationale: "Margin supports a 12% discount",
        confidence: 72,
        riskLevel: "LOW",
        decisionScore: 72,
      },
      merchant.id
    );

    expect(result.id).toBeTruthy();
    expect(result.reason).toBe("Margin supports a 12% discount");
    const row = await prisma.actionRequest.findUnique({ where: { id: result.id } });
    expect(row?.reason).toBe("Margin supports a 12% discount");
  });

  it("returns amountMinor so the approvals UI can show the real amount", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");

    const result = await createActionRequest(
      {
        actionType: "CASHBACK",
        strategyId: "strat-cash",
        amountMinor: 125000,
        currency: "INR",
      },
      merchant.id
    );

    expect(result.amountMinor).toBe(125000);
    expect(result.currency).toBe("INR");
  });

  it("still blocks an invalid action type and records it as BLOCKED", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");

    const result = await createActionRequest(
      {
        // Cast: the point of this case is a value outside the union, which is
        // what an unvalidated API client would send.
        actionType: "NOT_A_REAL_TYPE" as never,
        strategyId: "strat-x",
        amountMinor: 1000,
        currency: "INR",
      },
      merchant.id
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("Invalid action type");
  });

  it("rejects a negative amount", async () => {
    const user = await createUser();
    const merchant = await createMerchant(user.id, "Owner");
    await expect(
      createActionRequest(
        { actionType: "DISCOUNT", strategyId: "s", amountMinor: -1, currency: "INR" },
        merchant.id
      )
    ).rejects.toThrow();
  });
});

describe("validateActionRequest", () => {
  it("rejects an action request belonging to a different merchant", async () => {
    const aUser = await createUser();
    const bUser = await createUser();
    const a = await createMerchant(aUser.id, "Alpha");
    const b = await createMerchant(bUser.id, "Bravo");

    await prisma.actionRequest.create({
      data: {
        merchantId: b.id,
        opportunityType: "DISCOUNT",
        strategyId: "s",
        strategyName: "s",
        recommendedScenario: "EXPECTED",
        decisionScore: 50,
        riskLevel: "LOW",
        confidence: 50,
        status: "PENDING",
        amountMinor: 1000,
      },
    });
    const foreign = await prisma.actionRequest.findFirst({ where: { merchantId: b.id } });

    // Both caller-supplied ids match (Alpha's), so the old bare-id lookup
    // wrongly reported the request as valid.
    const result = await validateActionRequest(foreign!.id, a.id, a.id);
    expect(result.valid).toBe(false);
  });
});
