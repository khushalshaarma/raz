const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir);

const newCleanup = `async function cleanup() {
  try { await prisma.\$executeRawUnsafe("PRAGMA foreign_keys = OFF"); } catch(e) {}
  const tables = ["policyRule","actionRequest","governanceDecision","auditLog","policy","scenario","customer","merchant","user","systemHealth","opportunity","agent","simulation","decision","decisionOutcome","strategyExperiment","product","order","orderItem","payment","campaign","auditEvent"];
  for (const t of tables) {
    try { await prisma.\$executeRawUnsafe(\`DELETE FROM \${t};\`); } catch(e) {}
  }
  try { await prisma.\$executeRawUnsafe("PRAGMA foreign_keys = ON"); } catch(e) {}
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
