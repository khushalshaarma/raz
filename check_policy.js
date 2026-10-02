const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$connect().then(async () => {
  const policy = await p.policy.findFirst({ where: { id: { not: null } } });
  if (policy) {
    console.log('Policy fields:', Object.keys(policy));
    console.log('Action:', policy.action);
    console.log('ConditionType:', policy.conditionType);
    console.log('ConditionOperator:', policy.conditionOperator);
    console.log('ConditionValue:', policy.conditionValue);
  } else {
    console.log('No policy found');
  }
  await p.$disconnect();
}).catch(e => { console.log(e); p.$disconnect(); });
