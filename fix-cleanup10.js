const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir);

const newCleanup = `async function cleanup() {
  try { await prisma.\$disconnect(); } catch(e) {}
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  try { await p.\$executeRawUnsafe("PRAGMA foreign_keys = OFF"); } catch(e) {}
  const tables = ["orderItem","payment","order","decisionOutcome","decision","simulation","strategyExperiment","opportunity","agent","auditEvent","customer","actionRequest","governanceDecision","auditLog","policyRule","policy","scenario","merchant","user","systemHealth","product","campaign"];
  for (const t of tables) {
    try { await p.\$executeRawUnsafe(\`DELETE FROM \${t};\`); } catch(e) {}
  }
  try { await p.\$executeRawUnsafe("PRAGMA foreign_keys = ON"); } catch(e) {}
  try { await p.\$disconnect(); } catch(e) {}
  const { prisma: p2 } = require("@/lib/prisma");
  await p2.\$connect();
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
