const fs = require('fs');
const path = 'C:/Users/mukun/Downloads/raz/src/app/api/merchant/opportunities/route.ts';
let s = fs.readFileSync(path, 'utf8');
s = s.replace(/import { prisma } from "@\/lib\/prisma";/, 'import { getMerchantOpportunities } from "@/lib/product/opportunity-center";');
s = s.replace(/export async function GET\(\) \{/, 'export async function GET(req: NextRequest) {');
const block = `    const opportunities = await prisma.opportunity.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });`;
if (s.includes(block)) {
  s = s.replace(block, `    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const opportunities = await getMerchantOpportunities(merchantId, { status });`);
  console.log('block replaced');
} else {
  console.log('block not found');
}
fs.writeFileSync(path, s);
console.log('patched');
