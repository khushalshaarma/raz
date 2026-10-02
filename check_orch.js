const fs = require('fs');
const path = 'src/lib/intelligence/orchestrator.ts';
const s = fs.readFileSync(path, 'utf8');
const lines = s.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('$executeRawUnsafe')) {
    console.log(`${i+1}: ${lines[i]}`);
    if (lines[i+1]) console.log(`${i+2}: ${lines[i+1]}`);
    if (lines[i+2]) console.log(`${i+3}: ${lines[i+2]}`);
    break;
  }
}
