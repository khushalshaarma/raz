const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

files.forEach(f => {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');

  // Replace cleanup function with one that uses $disconnect/$connect for same-connection PRAGMA
  const cleanupRegex = /async function cleanup\(\) \{[\s\S]*?\n\}/;
  const newCleanup = `async function cleanup() {
  await prisma.$disconnect();
  await prisma.$connect();
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=OFF');
  const tables=['systemHealth','opportunity','strategyExperiment','simulation','decision','decisionOutcome','campaign','agent','auditEvent','auditLog','governanceDecision','actionRequest','policyRule','policy','customer','orderItem','payment','order','product','merchant','user'];
  for(const t of tables){try{await prisma.$executeRawUnsafe(\`DELETE FROM \${t}\`);}catch(e){try{await prisma.$executeRawUnsafe(\`DELETE FROM "\${t}"\`);}catch(e2){}}}
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON');
  await prisma.$disconnect();
}`;
  c = c.replace(cleanupRegex, newCleanup);

  fs.writeFileSync(p, c);
  console.log('Fixed cleanup: ' + f);
});
