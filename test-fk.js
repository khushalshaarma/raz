const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  try {
    await p.user.deleteMany();
    await p.merchant.deleteMany();
    const u = await p.user.create({ data: { email: 'test1@x.com', password: 'h', name: 'T', role: 'MERCHANT' } });
    console.log('User created:', u.id);
    const m = await p.merchant.create({ data: { ownerId: u.id, businessName: 'B', email: 'b@x.com' } });
    console.log('Merchant created:', m.id);
    console.log('OK - FK works fine');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await p.$disconnect();
  }
}
main();
