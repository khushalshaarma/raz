const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();
prisma.opportunity.findMany({ take: 3, select: { type: true, title: true } }).then(r => {
  console.log(r);
  return prisma.$disconnect();
}).catch(e=>{console.error(e);prisma.$disconnect().finally(()=>process.exit(1));});
