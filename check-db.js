const fs = require('fs');
const path = require('path');

console.log('Root dev.db exists:', fs.existsSync('dev.db'));
console.log('Prisma dev.db exists:', fs.existsSync('prisma/dev.db'));

const envContent = fs.readFileSync('.env', 'utf8');
console.log('.env:', envContent);

const schemaContent = fs.readFileSync('prisma/schema.prisma', 'utf8');
const match = schemaContent.match(/url\s*=\s*env\("(\w+)"\)/);
if (match) console.log('DATABASE_URL env var:', match[1]);

const prismaEnv = fs.existsSync('prisma/.env') ? fs.readFileSync('prisma/.env', 'utf8') : 'No prisma/.env';
console.log('prisma/.env:', prismaEnv);
