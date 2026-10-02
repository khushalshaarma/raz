const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();
prisma.merchant.findMany({ select: { id: true, businessName: true } }).then(async m => {
  const uw = m.find(x=>x.businessName==='UrbanWear');
  const ar = await prisma.actionRequest.findMany({ where: { merchantId: uw?.id }, select: { id: true, status: true, opportunityType: true, strategyId: true } });
  const g = await prisma.governanceDecision.findMany({ where: { merchantId: uw?.id }, select: { id: true, actionRequestId: true, status: true, decision: true } });
  console.log('ar:', ar);
  console.log('g:', g);
  return prisma.$disconnect();
}).catch(e=>{console.error(e);prisma.$disconnect().finally(()=>process.exit(1));});
