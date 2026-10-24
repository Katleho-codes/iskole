import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/api/src/routes/community.ts';
let c = readFileSync(p, 'utf8');
c = c.replace('  let lastId = null;', '  let lastId: string | null = null;');
c = c.replace('      const userId = req.authUser.id;', '      const userId = req.authUser!.id;');
c = c.replace("        where: { communityId, userId: { notIn: Array.from(blockedIds) } },",
  "        where: { communityId, userId: { notIn: Array.from(blockedIds) as string[] } },");
c = c.replace("          select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },",
  "          select: { id: true, body: true, createdAt: true, userId: true, user: { select: { name: true } } },");
writeFileSync(p, c);
console.log('done');
