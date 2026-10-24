/**
 * Moderator queue and actions.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { notFound, forbidden } from '../lib/http-error';

export const moderationRouter = Router();

const ResolveSchema = z
  .object({
    action: z.enum(['DISMISS', 'WARN', 'REMOVE_MESSAGE', 'SUSPEND']),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

moderationRouter.get(
  '/moderation/reports',
  requireSession,
  requireRole('MODERATOR', 'ADMIN'),
  async (_req, res, next) => {
    try {
      const reports = await prisma.report.findMany({
        where: { status: 'SUBMITTED' },
        orderBy: { createdAt: 'asc' },
        include: { reporter: { select: { id: true, name: true } } },
      });
      res.json({ reports });
    } catch (error) {
      next(error);
    }
  },
);

moderationRouter.post(
  '/moderation/reports/:id/resolve',
  requireSession,
  requireRole('MODERATOR', 'ADMIN'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const input = ResolveSchema.parse(req.body);
      const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const report = await prisma.report.findUnique({ where: { id: reportId } });
      if (!report) return next(notFound('report not found'));
      if (report.status !== 'SUBMITTED') {
        return res.json({ report: { id: report.id, status: report.status } });
      }

      if (input.action === 'REMOVE_MESSAGE' && report.targetType === 'MESSAGE') {
        await prisma.message.delete({ where: { id: report.targetId } }).catch(() => undefined);
      }
      if (input.action === 'SUSPEND') {
        // best effort - mark user if target is user
        if (report.targetType === 'USER') {
          await prisma.user.update({ where: { id: report.targetId }, data: { banned: true, banReason: input.notes ?? 'moderator action' } }).catch(() => undefined);
        }
      }

      const updated = await prisma.report.update({
        where: { id: report.id },
        data: {
          status: input.action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED',
          resolution: input.action,
          resolvedById: userId,
          resolvedAt: new Date(),
        },
        select: { id: true, status: true, resolution: true, resolvedAt: true },
      } as any);

      await prisma.auditLog.create({
        data: {
          userId,
          type: 'MODERATOR_ACTION',
          detail: JSON.stringify({ reportId: report.id, action: input.action, targetType: report.targetType, targetId: report.targetId }),
        },
      } as any);

      res.json({ report: updated });
    } catch (error) {
      next(error);
    }
  },
);

export default moderationRouter;
