import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const coursesRouter = Router();

coursesRouter.get('/courses', async (req, res, next) => {
  try {
    const field = typeof req.query.field === 'string' ? req.query.field : undefined;
    const province = typeof req.query.province === 'string' ? req.query.province : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

    const courses = await prisma.course.findMany({
      where: {
        ...(field ? { field } : {}),
        ...(province ? { institution: { province } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        institution: true,
        requirements: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    res.json({ courses });
  } catch (error) {
    next(error);
  }
});

coursesRouter.get('/courses/:id', async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        institution: true,
        requirements: true,
      },
    });
    if (!course) return res.status(404).json({ error: 'not found' });
    res.json({ course });
  } catch (error) {
    next(error);
  }
});
