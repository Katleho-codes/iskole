/**
 * Subject marks.
 *
 * POST is wrapped in idempotent(): a learner on a slow connection who taps save twice gets
 * one mark, not two. The handler itself also upserts on (userId, subject), so the two
 * protections cover different failures: idempotency covers the same request arriving twice,
 * the upsert covers two different requests naming the same subject.
 */
import { Router } from 'express';
import { markCreateSchema } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { listMarks, upsertMark } from '../data/marks';

export const marksRouter = Router();

marksRouter.get('/marks', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const marks = await listMarks(req.authUser!.id);
    res.json({
      marks: marks.map((mark) => ({
        id: mark.id,
        subject: mark.subject,
        mark: mark.mark,
        isHomeLanguage: mark.isHomeLanguage,
      })),
    });
  } catch (error) {
    next(error);
  }
});

marksRouter.post(
  '/marks',
  requireSession,
  requireRole('STUDENT'),
  idempotent(),
  async (req, res, next) => {
    try {
      const input = markCreateSchema.parse(req.body);
      const mark = await upsertMark(req.authUser!.id, input);
      res.status(201).json({
        mark: {
          id: mark.id,
          subject: mark.subject,
          mark: mark.mark,
          isHomeLanguage: mark.isHomeLanguage,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);