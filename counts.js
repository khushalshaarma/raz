const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();
Promise.all([
  prisma.opportunity.count(),
  prisma.scenario.count(),
  prisma.simulation.count(),
  prisma.decision.count(),
  prisma.actionRequest.count(),
  prisma.governanceDecision.count(),
  prisma.execution.count(),
  prisma.reconciliation.count(),
]).then(([o,s,sim,d,ar,g,e,r]) => {
  console.log(JSON.stringify({o,s,sim,d,ar,g,e,r}));
  return prisma.$disconnect();
}).catch(e => {
  console.error('err', e);
  prisma.$disconnect().finally(()=>process.exit(1));
});
