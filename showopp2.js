const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();
prisma.merchant.findMany({select:{id:true,businessName:true}}).then(async m=>{
  const uw = m.find(x=>x.businessName==='UrbanWear');
  const opps = await prisma.opportunity.findMany({where:{merchantId: uw?.id}});
  console.log(JSON.stringify(opps,null,2));
  prisma.$disconnect();
});
