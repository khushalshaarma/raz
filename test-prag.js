const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  try {
    await p.user.deleteMany();
    await p.merchant.deleteMany();
    const u = await p.user.create({ data: { email: 'fktest@x.com', password: 'h', name: 'T', role: 'MERCHANT' } });
    console.log('User created:', u.id);
    
    // Try PRAGMA
    await p.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
    console.log('PRAGMA OFF succeeded');
    
    const m = await p.merchant.create({ data: { ownerId: u.id, businessName: 'B', email: 'b@x.com' } });
    console.log('Merchant created:', m.id);
    
    await p.$executeRawUnsafe('PRAGMA foreign_keys = ON');
    console.log('PRAGMA ON succeeded');
    console.log('OK');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await p.$disconnect();
  }
}
main();
