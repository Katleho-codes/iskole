require('dotenv').config({ path: '../../.env' });
const { PrismaClient } = require('./src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const email = process.argv[2] || 'demo@example.com';
prisma.user.update({ where: { email }, data: { role: 'ADMIN' } })
  .then(u => { console.log(u.email, u.role); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
