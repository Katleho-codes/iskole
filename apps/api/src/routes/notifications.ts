/**
 * Learner notifications.
 *
 * Every query is keyed off the session, never off a path parameter. A notification that
 * belongs to someone else returns 404 rather than 403, so the endpoint cannot be used to
 * probe which ids exist. Bodies are written by the server and never contain ID numbers,
 * contact details or document contents.
 */
import { Router } from 'express';
import { requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/http-error';

export const notificationsRouter = Router();

const MAX_NOTIFICATIONS = 100;

notificationsRouter.get('/notifications', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const unreadOnly = req.query.unread === 'true';

    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: MAX_NOTIFICATIONS,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    res.json({ notifications, unread });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/notifications/read-all', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ marked: result.count, unread: 0 });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/notifications/:id/read', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const notification = await prisma.notification.findFirst({
      where: { id: String(req.params.id), userId },
      select: { id: true, readAt: true },
    });

    if (!notification) {
      return next(notFound('notification not found'));
    }

    const updated =
      notification.readAt === null
        ? await prisma.notification.update({
            where: { id: notification.id },
            data: { readAt: new Date() },
            select: { id: true, readAt: true },
          })
        : notification;

    const unread = await prisma.notification.count({ where: { userId, readAt: null } });
    res.json({ notification: updated, unread });
  } catch (error) {
    next(error);
  }
});
