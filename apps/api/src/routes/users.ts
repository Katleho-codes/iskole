/**
 * User search for chat.
 */
import { Router } from 'express';
import { requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const usersRouter = Router();

usersRouter.get('/users/search', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) {
      return res.json({ users: [] });
    }
    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        email: {
          contains: email,
          mode: 'insensitive',
        },
      },
      take: 10,
      select: { id: true, name: true, email: true },
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

export default usersRouter;
