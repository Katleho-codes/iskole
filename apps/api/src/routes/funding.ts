import { Router } from 'express';
import { FundingCompareQuerySchema } from '@iskole/shared';
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
