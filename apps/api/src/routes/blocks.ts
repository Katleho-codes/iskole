/**
 * Blocks: user blocking and enforcement helpers.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/http-error';

export const blocksRouter = Router();

const BlockCreateSchema = z
  .object({
    userId: z.string().min(1).max(64),
  })
  .strict();

blocksRouter.get('/blocks', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: { id: true, name: true } } },
    });
    res.json({
      blocks: blocks.map((b) => ({
        id: b.id,
        blockedId: b.blockedId,
        blockedName: b.blocked.name,
        createdAt: b.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

blocksRouter.post('/blocks', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const input = BlockCreateSchema.parse(req.body);
    if (input.userId === userId) {
      return res.status(400).json({ error: 'cannot block yourself' });
    }
    const blocked = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!blocked) {
      return next(notFound('user not found'));
    }
    const block = await prisma.userBlock.create({
      data: { blockerId: userId, blockedId: input.userId },
    });
    res.status(201).json({ block: { id: block.id, blockedId: block.blockedId, createdAt: block.createdAt } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2002') {
      const existing = await prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: req.authUser!.id, blockedId: req.body?.userId } },
      });
      if (existing) {
        return res.json({ block: { id: existing.id, blockedId: existing.blockedId, createdAt: existing.createdAt } });
      }
    }
    next(error);
  }
});

blocksRouter.delete('/blocks/:userId', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const blockedId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export async function isBlocked(a: string, b: string) {
  const count = await prisma.userBlock.count({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return count > 0;
}
