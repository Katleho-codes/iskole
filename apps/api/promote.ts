import { PrismaClient } from './src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './src/lib/env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const email = process.argv[2] || 'demo@example.com';

async function main() {
  const user = await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
  console.log(user.email, user.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
