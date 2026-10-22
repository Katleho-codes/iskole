import express, { Router } from 'express';
import { ApplicationCreateSchema } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { assertCanApply } from '../lib/guardianship';
import { forbidden, HttpError, notFound, unprocessable } from '../lib/http-error';
import {
  createDownloadUrl,
  detectDocumentType,
  MAX_DOCUMENT_BYTES,
  removeStoredDocument,
  safeDocumentName,
  storeDocument,
  storedDocumentPath,
  verifyDownloadSignature,
} from '../lib/storage';

export const applicationsRouter = Router();

applicationsRouter.get('/applications', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const applications = await prisma.application.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            institution: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
        },
        // Metadata only. The storage key stays server-side; a download needs a signed link.
        documents: {
          select: { id: true, filename: true, mimeType: true, size: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
        },
        offerLetter: {
          select: { id: true, filename: true, sentAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ applications });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.post('/applications', requireSession, requireRole('STUDENT'), idempotent(), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const parsed = ApplicationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid body', issues: parsed.error.issues });
    }

    const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId } });
    if (!course) {
      return next(notFound('course not found'));
    }

    // POPIA: do not open an application (or accept documents for it) before the age and
    // guardian-consent rules pass. Submission checks again, because a draft could have been
    // created before a rule changed.
    await assertCanApply(userId);

    const existing = await prisma.application.findUnique({
      where: { userId_courseId: { userId, courseId: parsed.data.courseId } },
    });
    if (existing) {
      return res.status(409).json({ error: 'application already exists', application: existing });
    }

    const application = await prisma.application.create({
      data: {
        userId,
        courseId: parsed.data.courseId,
        status: 'DRAFT',
      },
      include: {
        course: {
          include: {
            institution: true,
          },
        },
      },
    });

    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        status: 'DRAFT',
        note: 'Application created',
        actorId: userId,
      },
    });

    res.status(201).json({ application });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.post('/applications/:id/submit', requireSession, requireRole('STUDENT'), idempotent(), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const application = await prisma.application.findUnique({
      where: { id: String(req.params.id) },
      include: { course: true },
    });

    if (!application) {
      return next(notFound('application not found'));
    }
    if (application.userId !== userId) {
      return next(forbidden('not allowed'));
    }
    if (application.status !== 'DRAFT') {
      return next(unprocessable('application cannot be submitted from current status'));
    }

    // POPIA: a missing date of birth, an under-18 without guardian consent, or an under-16
    // account must not reach an institution. The check is server-side for the same reason
    // the status check is: the client can hide a button, not enforce a rule.
    await assertCanApply(userId);

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      include: {
        course: {
          include: {
            institution: true,
          },
        },
      },
    });

    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        status: 'SUBMITTED',
        note: 'Application submitted',
        actorId: userId,
      },
    });

    res.json({ application: updated });
  } catch (error) {
    next(error);
  }
});

/** A single application cannot become a free file host. */
const MAX_DOCUMENTS_PER_APPLICATION = 10;

applicationsRouter.post(
  '/applications/:id/documents',
  requireSession,
  requireRole('STUDENT'),
  // Parse only the three accepted types, and only up to the shared size limit. JSON bodies
  // have already been consumed (or skipped) by express.json, so this stays route-local.
  express.raw({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    limit: MAX_DOCUMENT_BYTES,
  }),
  idempotent(),
  async (req, res, next) => {
    let storedKey: string | null = null;

    try {
      const userId = req.authUser!.id;
      const application = await prisma.application.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, userId: true, status: true },
      });

      if (!application) {
        return next(notFound('application not found'));
      }
      if (application.userId !== userId) {
        return next(forbidden('not allowed'));
      }
      if (application.status !== 'DRAFT') {
        return next(unprocessable('documents can only be added while the application is a draft'));
      }

      // Uploads contain identity documents. A minor without guardian consent, or a learner
      // with no date of birth, must not be able to attach them to a legacy draft.
      await assertCanApply(userId);

      const buffer = Buffer.isBuffer(req.body) ? req.body : null;
      if (!buffer || buffer.length === 0) {
        return next(new HttpError(415, 'send a PDF, JPEG or PNG file as the request body'));
      }

      // Content-Type is a claim; the first bytes are the evidence.
      const detected = detectDocumentType(buffer);
      if (!detected) {
        return next(new HttpError(415, 'only PDF, JPEG or PNG files are accepted'));
      }

      const existingCount = await prisma.document.count({
        where: { applicationId: application.id },
      });
      if (existingCount >= MAX_DOCUMENTS_PER_APPLICATION) {
        return next(
          unprocessable(`an application can hold at most ${MAX_DOCUMENTS_PER_APPLICATION} documents`),
        );
      }

      storedKey = await storeDocument(buffer, userId, detected.extension);
      const document = await prisma.document.create({
        data: {
          applicationId: application.id,
          filename: safeDocumentName(req.get('x-filename'), detected.extension),
          mimeType: detected.mimeType,
          size: buffer.length,
          key: storedKey,
        },
        select: { id: true, filename: true, mimeType: true, size: true, uploadedAt: true },
      });

      // No signed URL in this response: it is cached by the idempotency layer, and a link
      // minted now would be expired when a replay is served hours later. Callers ask for a
      // fresh link when they actually need to download.
      res.status(201).json({ document });
    } catch (error) {
      // Do not leave an orphaned file when the database write fails.
      if (storedKey) {
        await removeStoredDocument(storedKey).catch(() => undefined);
      }
      next(error);
    }
  },
);

/** Issue a short-lived link for a document the signed-in learner owns. */
applicationsRouter.get('/documents/:id/url', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const document = await prisma.document.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, application: { select: { userId: true } } },
    });

    if (!document) {
      return next(notFound('document not found'));
    }
    if (document.application.userId !== userId) {
      return next(forbidden('not allowed'));
    }

    res.json({ download: createDownloadUrl(document.id) });
  } catch (error) {
    next(error);
  }
});

/**
 * Signed download. Deliberately not session-gated: the signature is the credential, so a
 * link can be opened from an email or a new tab. It expires in minutes.
 */
applicationsRouter.get('/documents/:id/download', async (req, res, next) => {
  try {
    const documentId = String(req.params.id);
    if (!verifyDownloadSignature(documentId, req.query.expires, req.query.signature)) {
      return next(forbidden('this download link is invalid or has expired'));
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { filename: true, mimeType: true, key: true },
    });
    if (!document) {
      return next(notFound('document not found'));
    }

    const asciiName = document.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    let absolutePath: string;
    try {
      absolutePath = storedDocumentPath(document.key);
    } catch {
      // A row with a key outside the storage root is corrupt; do not read the filesystem.
      return next(notFound('document not found'));
    }

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(absolutePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.get('/offers/:id', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const offerLetter = await prisma.offerLetter.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        filename: true,
        sentAt: true,
        // userId is needed for the ownership check below; it is removed before the response.
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
