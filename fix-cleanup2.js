const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir);
const newCleanup = `async function cleanup() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  await prisma.actionRequest.deleteMany({});
  await prisma.governanceDecision.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.policy.deleteMany({});
  await prisma.scenario.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
}`;
for (const f of files) {
  if (f.endsWith('.test.ts')) {
    const fp = path.join(dir, f);
    let content = fs.readFileSync(fp, 'utf8');
    const cleanupRegex = /async function cleanup\(\) \{[\s\S]*?\n\}/;
    const match = content.match(cleanupRegex);
    if (match && match[0].includes('prisma')) {
      content = content.replace(cleanupRegex, newCleanup);
      fs.writeFileSync(fp, content);
      console.log('Fixed: ' + f);
    }
  }
}
