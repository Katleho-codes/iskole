import { Router } from 'express';
import { idempotent } from '../middleware/idempotency';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, unprocessable } from '../lib/http-error';
import { OfferDecisionSchema, canTransitionApplication, type ApplicationStatus } from '@iskole/shared';
import { createOfferDownloadLink, issueOffer } from '../lib/offers';
import { verifyDownloadSignature, storedDocumentPath } from '../lib/storage';
import { env } from '../lib/env';

export const offersRouter = Router();

offersRouter.get('/offers', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const offers = await prisma.offerLetter.findMany({
      where: { application: { userId } },
      select: {
        id: true,
        filename: true,
        sentAt: true,
        application: {
          select: {
            id: true,
            status: true,
            courseId: true,
            course: { select: { name: true, institution: { select: { name: true } } } },
          },
        },
      },
      orderBy: { sentAt: 'desc' },
    });
    res.json({ offers });
  } catch (error) {
    next(error);
  }
});

offersRouter.get('/offers/:id', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const offerLetter = await prisma.offerLetter.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        filename: true,
        sentAt: true,
        application: { select: { id: true, courseId: true, status: true, userId: true } },
      },
    });

    if (!offerLetter) {
      return next(notFound('offer not found'));
    }
    if (offerLetter.application.userId !== userId) {
      return next(forbidden('not allowed'));
    }

    const { userId: _ownerId, ...application } = offerLetter.application;
    res.json({ offerLetter: { ...offerLetter, application } });
  } catch (error) {
    next(error);
  }
});

offersRouter.get('/offers/:id/download', async (req, res, next) => {
  try {
    const offerId = String(req.params.id);
    if (!verifyDownloadSignature(offerId, req.query.expires, req.query.signature)) {
      return next(forbidden('this download link is invalid or has expired'));
    }

    const offerLetter = await prisma.offerLetter.findUnique({
      where: { id: offerId },
      select: { filename: true, key: true },
    });
    if (!offerLetter) {
      return next(notFound('offer not found'));
    }

    const asciiName = offerLetter.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    let absolutePath: string;
    try {
      absolutePath = storedDocumentPath(offerLetter.key);
    } catch {
      return next(notFound('offer not found'));
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(offerLetter.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(absolutePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

offersRouter.post('/offers/:id/respond', requireSession, requireRole('STUDENT'), idempotent(), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const parsed = OfferDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid body', issues: parsed.error.issues });
    }

    const offerLetter = await prisma.offerLetter.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        application: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
      },
    });

    if (!offerLetter) {
      return next(notFound('offer not found'));
    }
    if (offerLetter.application.userId !== userId) {
      return next(forbidden('not allowed'));
    }

    const targetStatus = parsed.data.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    const fromStatus = offerLetter.application.status as ApplicationStatus;
    if (!canTransitionApplication(fromStatus, targetStatus)) {
      return next(unprocessable('cannot respond to offer in current status'));
    }

    const updated = await prisma.application.update({
      where: { id: offerLetter.application.id },
      data: { status: targetStatus },
      include: {
        course: { include: { institution: true } },
      },
    });

    await prisma.applicationEvent.create({
      data: {
        applicationId: offerLetter.application.id,
        status: targetStatus,
        note: parsed.data.decision === 'ACCEPT' ? 'Offer accepted' : 'Offer declined',
        actorId: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: `OFFER_${parsed.data.decision}`,
        entity: 'application',
        entityId: offerLetter.application.id,
      },
    });

    res.json({ application: updated, decision: parsed.data.decision });
  } catch (error) {
    next(error);
  }
});

offersRouter.post(
  '/admin/applications/:id/offer',
  requireSession,
  requireRole('MODERATOR', 'ADMIN'),
  idempotent(),
  async (req, res, next) => {
    try {
      const result = await issueOffer({
        applicationId: String(req.params.id),
        actorId: req.authUser!.id,
        note: typeof req.body?.note === 'string' ? req.body.note : 'Offer issued by institution',
      });
      res.status(201).json({ offerLetterId: result.offerLetterId });
    } catch (error) {
      next(error);
    }
  },
);

offersRouter.post(
  '/applications/:id/simulate-review',
  requireSession,
  requireRole('STUDENT'),
  idempotent(),
  async (req, res, next) => {
    try {
      if (!env.DEMO_MODE) {
        return res.status(404).json({ error: 'not found' });
      }

      const userId = req.authUser!.id;
      const application = await prisma.application.findUnique({
        where: { id: String(req.params.id) },
      });

      if (!application) {
        return next(notFound('application not found'));
      }
      if (application.userId !== userId) {
        return next(forbidden('not allowed'));
      }

      if (application.status === 'OFFER_ISSUED') {
        const existing = await prisma.offerLetter.findUnique({
          where: { applicationId: application.id },
        });
        if (existing) {
          return res.json({ offerLetterId: existing.id, status: application.status, simulated: true });
        }
      }

      if (application.status === 'SUBMITTED') {
        if (!canTransitionApplication('SUBMITTED', 'UNDER_REVIEW')) {
          return next(unprocessable('cannot move to UNDER_REVIEW'));
        }
        await prisma.application.update({
          where: { id: application.id },
          data: { status: 'UNDER_REVIEW' },
        });
        await prisma.applicationEvent.create({
          data: {
            applicationId: application.id,
            status: 'UNDER_REVIEW',
            note: 'Under review (simulated institution response)',
            actorId: userId,
          },
        });
        await prisma.notification.upsert({
          where: {
            userId_dedupeKey: { userId, dedupeKey: `review:${application.id}` },
          },
          create: {
            userId,
            type: 'REPORT',
            title: 'Application update',
            body: 'An institution is reviewing your application. We will tell you when there is an outcome.',
            href: '/applications',
            dedupeKey: `review:${application.id}`,
          },
          update: {},
        });
      }

      if (application.status === 'UNDER_REVIEW' || (await prisma.application.findUnique({ where: { id: application.id } }))?.status === 'UNDER_REVIEW') {
        const current = await prisma.application.findUnique({ where: { id: application.id } });
        if (current?.status === 'UNDER_REVIEW') {
          const result = await issueOffer({
            applicationId: application.id,
            actorId: userId,
            note: 'Offer issued (simulated institution response)',
            sendEmail: true,
          });
          return res.json({ offerLetterId: result.offerLetterId, status: 'OFFER_ISSUED', simulated: true });
        }
      }

      const final = await prisma.application.findUnique({
        where: { id: application.id },
        include: { offerLetter: true },
      });
      if (final?.offerLetter) {
        return res.json({ offerLetterId: final.offerLetter.id, status: final.status, simulated: true });
      }

      return res.status(422).json({ error: 'could not simulate review from current status' });
    } catch (error) {
      next(error);
    }
  },
);

offersRouter.get('/offers/:id/url', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const offerLetter = await prisma.offerLetter.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, application: { select: { userId: true } } },
    });
    if (!offerLetter) return next(notFound('offer not found'));
    if (offerLetter.application.userId !== userId) return next(forbidden('not allowed'));
    res.json({ download: createOfferDownloadLink(offerLetter.id) });
  } catch (error) {
    next(error);
  }
});
