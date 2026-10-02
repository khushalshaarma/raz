const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$connect().then(() => {
  return p.$executeRawUnsafe('PRAGMA foreign_keys=OFF;');
}).then(r => {
  console.log('PRAGMA OK', r);
  return p.$executeRawUnsafe('DELETE FROM user;');
}).then(r => {
  console.log('DELETE OK', r);
  return p.$disconnect();
}).catch(e => {
  console.log('ERROR:', e.message);
  return p.$disconnect();
});
