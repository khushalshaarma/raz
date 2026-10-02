const fs = require('fs');
const path = 'C:/Users/mukun/Downloads/raz/src/app/api/merchant/opportunities/route.ts';
let s = fs.readFileSync(path, 'utf8');
s = s.replace(/import { prisma } from "@\/lib\/prisma";/, 'import { getMerchantOpportunities } from "@/lib/product/opportunity-center";');
s = s.replace(/export async function GET\(\) \{/, 'export async function GET(req: NextRequest) {');
s = s.replace(/const opportunities = await prisma\.opportunity\.findMany\(\{
  where: \{ merchantId \},
  orderBy: \{ createdAt: "desc" \},
\}\);/, 'const { searchParams } = new URL(req.url);\n    const status = searchParams.get("status") ?? undefined;\n    const opportunities = await getMerchantOpportunities(merchantId, { status });');
fs.writeFileSync(path, s);
console.log('patched');
