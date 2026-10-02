const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();
prisma.actionRequest.findMany({ take: 5, select: { id: true, opportunityType: true, strategyId: true, merchantId: true } }).then(r => {
  console.log(JSON.stringify(r,null,2));
  return prisma.$disconnect();
}).catch(e => {
  console.error(e);
  return prisma.$disconnect().finally(()=>process.exit(1));
});
