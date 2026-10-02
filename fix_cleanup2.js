const fs = require('fs');
const path = require('path');

const dir = 'tests/governance';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

const newCleanup = `async function cleanup() {
  await prisma.$disconnect();
  await prisma.$connect();
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  await prisma.auditEvent.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.governanceDecision.deleteMany({});
  await prisma.actionRequest.deleteMany({});
  await prisma.policyRule.deleteMany({});
  await prisma.policy.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.systemHealth.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.opportunity.deleteMany({});
  await prisma.agent.deleteMany({});
  await prisma.scenario.deleteMany({});
  await prisma.simulation.deleteMany({});
  await prisma.decision.deleteMany({});
  await prisma.decisionOutcome.deleteMany({});
  await prisma.strategyExperiment.deleteMany({});
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}
`;

let fixed = 0;
files.forEach(f => {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('PRAGMA foreign_keys') || c.includes('const TABLES')) {
    const cleanupRegex = /async function cleanup\(\) \{[\s\S]*?\n\}/;
    c = c.replace(cleanupRegex, newCleanup.trim());
    fs.writeFileSync(p, c);
    fixed++;
    console.log('Fixed: ' + f);
  }
});
console.log('Fixed ' + fixed + ' files');
