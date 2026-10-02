const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();
Promise.all([
  prisma.merchant.findMany({ select: { id: true, businessName: true } }),
  prisma.opportunity.count(),
  prisma.actionRequest.count(),
]).then(async ([m,o,ar]) => {
  const uw = m.find(x=>x.businessName==='UrbanWear') || m[0];
  const a = await prisma.actionRequest.count({ where: { merchantId: uw?.id } });
  const g = await prisma.governanceDecision.count({ where: { merchantId: uw?.id } });
  const sim = await prisma.simulation.count({ where: { merchantId: uw?.id } });
  console.log(JSON.stringify({uw: uw?.businessName, uwId: uw?.id, o, ar, a_uw: a, g_uw: g, sim_uw: sim}, null, 2));
  return prisma.$disconnect();
}).catch(e=>{console.error(e);prisma.$disconnect().finally(()=>process.exit(1));});
