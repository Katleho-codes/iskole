import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/api/src/routes/community.ts';
let c = readFileSync(p, 'utf8');
c = c.replace(/\r?\n\s*communityRouter\.get\([^\)]*messages\/stream[^\;]*\);[\s\S]*$/m, '');
const stream = `

communityRouter.get('/messages/stream', requireSession, async (req, res) => {
  const communityId = String(req.query.communityId || '');
  if (!communityId) {
    return res.status(400).json({ error: 'communityId required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  let lastId = null;
  const sendUpdates = async () => {
    try {
      const userId = req.authUser.id;
      const blocks = await prisma.userBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      });
      const blockedIds = new Set();
      for (const b of blocks) {
        if (b.blockerId === userId) blockedIds.add(b.blockedId);
        if (b.blockedId === userId) blockedIds.add(b.blockerId);
      }
      const messages = await prisma.message.findMany({
        where: { communityId, userId: { notIn: Array.from(blockedIds) } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },
      });
      const latest = messages[0] && messages[0].id;
      if (latest && latest !== lastId) {
        lastId = latest;
        const data = JSON.stringify({
          messages: messages.slice().reverse().map((m) => ({
            id: m.id,
            body: m.body,
            createdAt: m.createdAt,
            authorName: m.user.name,
          })),
        });
        res.write('data: ' + data + '\\n\\n');
      }
    } catch (e) {}
  };
  await sendUpdates();
  const iv = setInterval(sendUpdates, 5000);
  req.on('close', () => {
    clearInterval(iv);
    res.end();
  });
});

export default communityRouter;
`;
c += stream;
writeFileSync(p, c);
console.log('done');
