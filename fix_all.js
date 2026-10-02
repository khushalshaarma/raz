const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

files.forEach(f => {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');

  // Remove unused TABLES arrays
  c = c.replace(/const TABLES = \[[\s\S]*?\];\n\n/, '');

  // Fix merchantId references in email replacements to just use Date.now()
  c = c.replace(/\$\{merchantId \|\| "test"\}-\$\{Date\.now\(\)\}/g, '${Date.now()}');
  c = c.replace(/\$\{merchantId \|\| "test"\}-/g, '${Date.now()}-');

  // Fix cleanup to use single prisma.$executeRawUnsafe call
  const cleanupRegex = /async function cleanup\(\) \{[\s\S]*?\n\}/;
  const newCleanup = `async function cleanup() {
  await prisma.$executeRawUnsafe(\`PRAGMA foreign_keys = OFF; DELETE FROM systemHealth; DELETE FROM opportunity; DELETE FROM strategyExperiment; DELETE FROM simulation; DELETE FROM decision; DELETE FROM decisionOutcome; DELETE FROM campaign; DELETE FROM agent; DELETE FROM auditEvent; DELETE FROM auditLog; DELETE FROM governanceDecision; DELETE FROM actionRequest; DELETE FROM policyRule; DELETE FROM policy; DELETE FROM customer; DELETE FROM orderItem; DELETE FROM payment; DELETE FROM "order"; DELETE FROM product; DELETE FROM merchant; DELETE FROM user; PRAGMA foreign_keys = ON;\`);
}`;
  c = c.replace(cleanupRegex, newCleanup);

  fs.writeFileSync(p, c);
  console.log('Fixed: ' + f);
});
