const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$connect().then(async () => {
  const policy = await p.policy.findFirst();
  if (policy) {
    console.log('Keys:', Object.keys(policy));
    console.log('Has action:', 'action' in policy);
    console.log('Action value:', policy.action);
    console.log('All values:', JSON.stringify(policy, null, 2).slice(0, 500));
  } else {
    console.log('No policy found');
  }
  await p.$disconnect();
}).catch(e => { console.log(e.message); p.$disconnect(); });
