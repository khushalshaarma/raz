const fs = require('fs');
const path = require('path');

const dir = 'tests/governance';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

const newCleanup = `async function cleanup() {
  await prisma.$executeRawUnsafe(\`PRAGMA foreign_keys = OFF; DELETE FROM systemHealth; DELETE FROM opportunity; DELETE FROM strategyExperiment; DELETE FROM simulation; DELETE FROM decision; DELETE FROM decisionOutcome; DELETE FROM campaign; DELETE FROM agent; DELETE FROM auditEvent; DELETE FROM auditLog; DELETE FROM governanceDecision; DELETE FROM actionRequest; DELETE FROM policyRule; DELETE FROM policy; DELETE FROM customer; DELETE FROM orderItem; DELETE FROM payment; DELETE FROM "order"; DELETE FROM product; DELETE FROM merchant; DELETE FROM user; PRAGMA foreign_keys = ON;\`);
}
`;

let fixed = 0;
files.forEach(f => {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('PRAGMA foreign_keys') || c.includes('const TABLES') || c.includes('deleteMany({})')) {
    const cleanupRegex = /async function cleanup\(\) \{[\s\S]*?\n\}/;
    c = c.replace(cleanupRegex, newCleanup.trim());
    fs.writeFileSync(p, c);
    fixed++;
    console.log('Fixed: ' + f);
  }
});
console.log('Fixed ' + fixed + ' files');
