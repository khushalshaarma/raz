const fs = require('fs');
const s = fs.readFileSync('C:\\Users\\mukun\\Downloads\\raz\\src\\lib\\intelligence\\orchestrator.ts','utf8');
const lines = s.split(/\r?\n/);
const l = lines[79];
console.log('line79:', JSON.stringify(l));
console.log('line80:', JSON.stringify(lines[80]));
console.log('line81:', JSON.stringify(lines[81]));
