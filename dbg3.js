const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();
prisma.merchant.findMany({ select: { id: true, businessName: true } }).then(async m => {
  const uw = m.find(x=>x.businessName==='UrbanWear');
  if(!uw){ console.log('no uw'); return prisma.$disconnect(); }
  const sims = await prisma.simulation.findMany({ where: { merchantId: uw.id }, select: { id: true, opportunityType: true, strategyId: true } });
  const ars = await prisma.actionRequest.findMany({ where: { merchantId: uw.id }, select: { id: true, opportunityType: true, strategyId: true } });
  const g = await prisma.governanceDecision.findMany({ where: { merchantId: uw.id }, select: { id: true, actionRequestId: true, status: true, decision: true } });
  console.log('sims:', sims.length);
  console.log(sims);
  console.log('ars:', ars.length);
  console.log(ars);
  console.log('g:', g.length);
  console.log(g);
  return prisma.$disconnect();
}).catch(e=>{console.error(e);prisma.$disconnect().finally(()=>process.exit(1));});
