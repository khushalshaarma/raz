const fs = require('fs');
const path = require('path');
const dir = 'tests/governance';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

files.forEach(f => {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  
  // Remove unused TABLES arrays
  c = c.replace(/const TABLES = \[[\s\S]*?\];\n\n/, '');
  
  // Fix hardcoded emails in setupMerchant
  c = c.replace(/email:\s*"([^"]+)"/g, (match, email) => 'email: `${merchantId || "test"}-' + Date.now() + '-' + email + '@example.com`');
  c = c.replace(/businessName:\s*"([^"]+)"/g, (match, name) => 'businessName: `${merchantId || "test"}-' + name + '`');
  
  fs.writeFileSync(p, c);
  console.log('Processed: ' + f);
});
