const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir);

const newCleanup = `async function cleanup() {
  try { await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF"); } catch(e) {}
  try { await prisma.policyRule.deleteMany({}); } catch(e) {}
  try { await prisma.actionRequest.deleteMany({}); } catch(e) {}
  try { await prisma.governanceDecision.deleteMany({}); } catch(e) {}
  try { await prisma.auditLog.deleteMany({}); } catch(e) {}
  try { await prisma.policy.deleteMany({}); } catch(e) {}
  try { await prisma.scenario.deleteMany({}); } catch(e) {}
  try { await prisma.customer.deleteMany({}); } catch(e) {}
  try { await prisma.merchant.deleteMany({}); } catch(e) {}
  try { await prisma.user.deleteMany({}); } catch(e) {}
  try { await prisma.systemHealth.deleteMany({}); } catch(e) {}
  try { await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON"); } catch(e) {}
}`;

for (const f of files) {
  if (f.endsWith('.test.ts')) {
    const fp = path.join(dir, f);
    let content = fs.readFileSync(fp, 'utf8');
    const cleanupRegex = /async function cleanup\(\) \{[\s\S]*?\n\}/g;
    const match = content.match(cleanupRegex);
    if (match && match[0].includes('prisma')) {
      content = content.replace(cleanupRegex, newCleanup);
      fs.writeFileSync(fp, content);
      console.log('Fixed: ' + f);
    }
  }
}
