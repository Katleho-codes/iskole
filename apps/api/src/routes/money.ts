import { Router } from 'express';
import { PaydayInputSchema } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const moneyRouter = Router();

moneyRouter.get('/money/plan', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const plan = await prisma.moneyPlan.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { paydayDay: true, updatedAt: true },
    });
    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

moneyRouter.put('/money/plan', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const input = PaydayInputSchema.parse(req.body);
    const plan = await prisma.moneyPlan.upsert({
      where: { userId },
      create: { userId, paydayDay: input.paydayDay },
      update: { paydayDay: input.paydayDay },
      select: { paydayDay: true, updatedAt: true },
    });
    res.json({ plan });
  } catch (error) {
    next(error);
  }
});
