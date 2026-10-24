import { PrismaClient } from './apps/api/src/generated/prisma/index.js';
const prisma = new PrismaClient();
try {
  const users = await prisma.user.findMany({ take: 5 });
  console.log(users.map(u => ({ id: u.id, email: u.email, role: u.role })));
} catch (e) {
  console.error(e.toString());
} finally {
  await prisma.$disconnect();
}
