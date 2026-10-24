import { Router } from 'express';
import { FundingCompareQuerySchema } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { notFound } from '../lib/http-error';
import { prisma } from '../lib/prisma';

export const fundingRouter = Router();

fundingRouter.get('/funding', async (_req, res, next) => {
  try {
    const fundingOptions = await prisma.fundingOption.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ fundingOptions });
  } catch (error) {
    next(error);
  }
});

fundingRouter.get('/funding/compare', async (req, res, next) => {
  try {
    const parsed = FundingCompareQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid query', issues: parsed.error.issues });
    }

    const ids = parsed.data.ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids required' });
    }

    const fundingOptions = await prisma.fundingOption.findMany({
      where: { id: { in: ids } },
    });

    const byId = new Map(fundingOptions.map((f) => [f.id, f]));
    const ordered = ids.map((id) => byId.get(id)).filter((f): f is NonNullable<typeof f> => Boolean(f));

    res.json({ fundingOptions: ordered });
  } catch (error) {
    next(error);
  }
});

/** Saved options are bookmarks, scoped to the signed-in learner. */
fundingRouter.get(
  '/funding/saved',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const saved = await prisma.savedFunding.findMany({
        where: { userId },
        include: { fundingOption: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ savedFunding: saved });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT rather than POST: saving the same option twice is the same state, so the operation is
 * naturally idempotent and does not need an Idempotency-Key.
 */
fundingRouter.put(
  '/funding/:id/save',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const fundingOption = await prisma.fundingOption.findFirst({
        where: { id: String(req.params.id), isActive: true },
      });
      if (!fundingOption) return next(notFound('funding option not found'));

      const saved = await prisma.savedFunding.upsert({
        where: {
          userId_fundingOptionId: { userId, fundingOptionId: fundingOption.id },
        },
        create: { userId, fundingOptionId: fundingOption.id },
        update: {},
      });

      res.status(201).json({ savedFunding: saved });
    } catch (error) {
      next(error);
    }
  },
);

fundingRouter.delete(
  '/funding/:id/save',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      await prisma.savedFunding.deleteMany({
        where: { userId, fundingOptionId: String(req.params.id) },
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
