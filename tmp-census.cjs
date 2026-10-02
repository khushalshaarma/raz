const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const arjun = await p.user.findUnique({ where: { email: "arjun@urbanwear.in" } });
  if (!arjun) { console.log("arjun user MISSING"); await p.$disconnect(); return; }
  const m = await p.merchant.findFirst({ where: { ownerId: arjun.id } });
  if (!m) { console.log("arjun has NO merchant row"); await p.$disconnect(); return; }
  console.log("=== UrbanWear (arjun@urbanwear.in) merchantId:", m.id, "===");

  const models = [
    "customer", "order", "orderItem", "payment", "product", "opportunity",
    "strategyExperiment", "simulation", "scenario", "decision", "decisionOutcome",
    "actionRequest", "governanceDecision", "execution", "executionAttempt",
    "agentRun", "agentTask", "agentMessage", "agentProposal", "growthCycle",
    "campaign", "auditLog", "auditEvent", "reconciliation", "policy", "webhookEvent",
  ];
  for (const model of models) {
    try {
      const n = await p[model].count({ where: { merchantId: m.id } });
      console.log(String(n).padStart(6), model);
    } catch (e) {
      console.log("   ERR ", model, e.message.split("\n")[0].slice(0, 90));
    }
  }

  console.log("\n=== ORDER DATE SPREAD (UrbanWear) ===");
  const orders = await p.order.findMany({
    where: { merchantId: m.id },
    select: { createdAt: true, status: true, totalMinor: true },
    orderBy: { createdAt: "desc" },
  });
  if (orders.length) {
    console.log("newest:", orders[0].createdAt.toISOString());
    console.log("oldest:", orders[orders.length - 1].createdAt.toISOString());
    const byStatus = {};
    for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    console.log("statuses:", JSON.stringify(byStatus));
    const now = Date.now();
    const d30 = orders.filter(o => now - o.createdAt.getTime() < 30 * 864e5).length;
    console.log(`orders in last 30d: ${d30} / ${orders.length}`);
  }

  console.log("\n=== CUSTOMER PURCHASE HISTORY (UrbanWear) ===");
  const custs = await p.customer.findMany({
    where: { merchantId: m.id },
    select: { id: true, name: true, email: true, _count: { select: { orders: true } } },
  });
  const multi = custs.filter(c => c._count.orders > 1).length;
  console.log(`customers=${custs.length} with>1 order=${multi}`);
  for (const c of custs.slice(0, 8)) console.log(`  ${c.name} <${c.email}> orders=${c._count.orders}`);

  await p.$disconnect();
})();