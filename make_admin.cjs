const { PrismaClient } = require('./apps/api/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config({ path: './.env' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const email = process.argv[2];
if (!email) { console.error('usage'); process.exit(1); }
prisma.user.update({ where: { email }, data: { role: 'ADMIN' } })
  .then(u => { console.log(u.email, u.role); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
