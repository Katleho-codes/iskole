import { PrismaClient } from './apps/api/src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('usage: node make_admin.mjs email');
    process.exit(1);
  }
  const user = await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
  console.log(user.email, user.role);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
