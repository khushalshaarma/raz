const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir);

// Fix merchant.create calls that don't have a user first
const patterns = [
  // kill-switch.test.ts
  {
    file: 'kill-switch.test.ts',
    fixes: [
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "M", email: "m@example.com" } });',
        to: 'const user1 = await prisma.user.create({ data: { email: "m@example.com", password: "hash", name: "M", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user1.id, businessName: "M", email: "m@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "MA", email: "ma@example.com" } });',
        to: 'const user2 = await prisma.user.create({ data: { email: "ma@example.com", password: "hash", name: "MA", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user2.id, businessName: "MA", email: "ma@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "MB", email: "mb@example.com" } });',
        to: 'const user3 = await prisma.user.create({ data: { email: "mb@example.com", password: "hash", name: "MB", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user3.id, businessName: "MB", email: "mb@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "MC", email: "mc@example.com" } });',
        to: 'const user4 = await prisma.user.create({ data: { email: "mc@example.com", password: "hash", name: "MC", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user4.id, businessName: "MC", email: "mc@example.com" } });'
      }
    ]
  },
  // idempotency.test.ts
  {
    file: 'idempotency.test.ts',
    fixes: [
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "IDEM", email: "idem@example.com" } });',
        to: 'const user1 = await prisma.user.create({ data: { email: "idem@example.com", password: "hash", name: "IDEM", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user1.id, businessName: "IDEM", email: "idem@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "IDEM2", email: "idem2@example.com" } });',
        to: 'const user2 = await prisma.user.create({ data: { email: "idem2@example.com", password: "hash", name: "IDEM2", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user2.id, businessName: "IDEM2", email: "idem2@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "IDEM3", email: "idem3@example.com" } });',
        to: 'const user3 = await prisma.user.create({ data: { email: "idem3@example.com", password: "hash", name: "IDEM3", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user3.id, businessName: "IDEM3", email: "idem3@example.com" } });'
      }
    ]
  },
  // fail-closed.test.ts
  {
    file: 'fail-closed.test.ts',
    fixes: [
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "FCAUDIT", email: "fcaudit@example.com" } });',
        to: 'const user1 = await prisma.user.create({ data: { email: "fcaudit@example.com", password: "hash", name: "FCAUDIT", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user1.id, businessName: "FCAUDIT", email: "fcaudit@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "FCEVERY", email: "fcevery@example.com" } });',
        to: 'const user2 = await prisma.user.create({ data: { email: "fcevery@example.com", password: "hash", name: "FCEVERY", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user2.id, businessName: "FCEVERY", email: "fcevery@example.com" } });'
      }
    ]
  },
  // merchant-isolation.test.ts
  {
    file: 'merchant-isolation.test.ts',
    fixes: [
      {
        from: 'const merchantA = await setupMerchantA();',
        to: 'const merchantA = await setupMerchantA();'
      },
      {
        from: 'const merchantB = await setupMerchantB();',
        to: 'const merchantB = await setupMerchantB();'
      }
    ]
  },
  // governance.test.ts
  {
    file: 'governance.test.ts',
    fixes: [
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "APPM", email: "appm@example.com" } });',
        to: 'const user = await prisma.user.create({ data: { email: "appm@example.com", password: "hash", name: "APPM", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "APPM", email: "appm@example.com" } });'
      }
    ]
  },
  // policy-engine.test.ts
  {
    file: 'policy-engine.test.ts',
    fixes: [
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "ALLOW", email: "allow@example.com" } });',
        to: 'const user = await prisma.user.create({ data: { email: "allow@example.com", password: "hash", name: "ALLOW", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "ALLOW", email: "allow@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "BLOCK", email: "block@example.com" } });',
        to: 'const user = await prisma.user.create({ data: { email: "block@example.com", password: "hash", name: "BLOCK", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "BLOCK", email: "block@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "REQ", email: "req@example.com" } });',
        to: 'const user = await prisma.user.create({ data: { email: "req@example.com", password: "hash", name: "REQ", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "REQ", email: "req@example.com" } });'
      },
      {
        from: 'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "PREC", email: "prec@example.com" } });',
        to: 'const user = await prisma.user.create({ data: { email: "prec@example.com", password: "hash", name: "PREC", role: "MERCHANT" } });\n      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "PREC", email: "prec@example.com" } });'
      }
    ]
  }
];

for (const { file, fixes } of patterns) {
  const fp = path.join(dir, file);
  let content = fs.readFileSync(fp, 'utf8');
  let changed = false;
  for (const { from, to } of fixes) {
    if (content.includes(from)) {
      content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&'), 'g'), to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(fp, content);
    console.log('Fixed: ' + file);
  }
}

// Fix governance.test.ts setupFull to create user
const govFp = path.join(dir, 'governance.test.ts');
let govContent = fs.readFileSync(govFp, 'utf8');
if (govContent.includes('const user = await prisma.user.create({ data: { email: "gov@example.com"') && !govContent.includes('ownerId: user.id')) {
  // Already has user but check if setupFull creates merchant properly
  console.log('Governance setupFull already has user');
}

// Fix the governance.test.ts setupFull
const govOld = `async function setupFull() {
  const user = await prisma.user.create({ data: { email: "gov@example.com", password: "hash", name: "Test", role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "GovMerchant", email: "gov@example.com" } });`;
const govNew = `async function setupFull() {
  const user = await prisma.user.create({ data: { email: "gov@example.com", password: "hash", name: "Test", role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "GovMerchant", email: "gov@example.com" } });`;
if (govContent.includes(govOld)) {
  console.log('Governance setupFull already correct');
} else if (govContent.includes('const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "GovMerchant"')) {
  govContent = govContent.replace(
    'const merchant = await prisma.merchant.create({ data: { ownerId: crypto.randomUUID(), businessName: "GovMerchant", email: "gov@example.com" } });',
    'const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: "GovMerchant", email: "gov@example.com" } });'
  );
  fs.writeFileSync(govFp, govContent);
  console.log('Fixed governance.test.ts setupFull');
}
