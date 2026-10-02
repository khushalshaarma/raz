const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir);

const newCleanup = `async function cleanup() {
  try { await prisma.\$executeRawUnsafe("PRAGMA foreign_keys = OFF"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM policyRule;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM actionRequest;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM governanceDecision;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM auditLog;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM policy;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM scenario;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM customer;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM merchant;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM user;"); } catch(e) {}
  try { await prisma.\$executeRawUnsafe("DELETE FROM systemHealth;"); } catch(e) {}
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
