const fs = require('fs');
['C:/Users/mukun/Downloads/raz/src/app/api/merchant/orders/route.ts','C:/Users/mukun/Downloads/raz/src/app/api/merchant/orders/[id]/route.ts'].forEach(f => {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace('actorId: typeof user?.id === "string" ? user.id : undefined,', 'actorId: user?.userId,');
  fs.writeFileSync(f, s);
  console.log('patched', f);
});
