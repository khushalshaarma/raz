const fs = require('fs');
const path = require('path');

const dir = 'tests/governance';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

const newCleanup = `async function cleanup() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  const tables = ["systemHealth","opportunity","strategyExperiment","simulation","decision","decisionOutcome","campaign","agent","auditEvent","auditLog","governanceDecision","actionRequest","policyRule","policy","customer","orderItem","payment","order","product","merchant","user"];
  for (const t of tables) {
    try { await prisma.\$executeRawUnsafe(\`DELETE FROM \${t};\`); } catch(e) { try { await prisma.\$executeRawUnsafe(\`DELETE FROM "\${t}";\`); } catch(e2) {} }
  }
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
