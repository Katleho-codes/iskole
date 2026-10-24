/**
 * POPIA controls: see and change what others can see, take a copy of your data, and close
 * the account.
 *
 * Rules:
 * - Talent visibility is opt-in and off by default. It is a learner's choice, not a
 *   company's, so only the learner routes can change it.
 * - The export contains the learner's own records only, keyed off the session. It never
 *   includes encrypted ID-number material, password hashes or session tokens.
 * - Account deletion is permanent and cascades. It needs an explicit confirmation string
 *   so a stray request cannot wipe an account.
 */
import { Router } from 'express';
import { z } from 'zod';
import { guardianConsentSchema, ConsentUpdateSchema } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { badRequest, unprocessable } from '../lib/http-error';
import { recordSecurityEvent } from '../lib/security-events';
import { removeStoredDocument } from '../lib/storage';
import { assertCanBeVisibleToCompanies, getAgeStatus } from '../lib/guardianship';

export const privacyRouter = Router();

const TalentVisibilitySchema = z.object({ visible: z.boolean() }).strict();

const DeleteAccountSchema = z.object({ confirm: z.literal('DELETE') }).strict();

privacyRouter.get(
  '/privacy/talent-visibility',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: { talentVisible: true },
      });

      res.json({ talentVisibility: { visible: profile?.talentVisible ?? false } });
    } catch (error) {
      next(error);
    }
  },
);

privacyRouter.put(
  '/privacy/talent-visibility',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const { visible } = TalentVisibilitySchema.parse(req.body);

      // Turning visibility off must always be allowed. Turning it on requires a proven adult
      // age, so a client cannot opt in before setting a date of birth.
      if (visible) {
        await assertCanBeVisibleToCompanies(userId);
      }

      const profile = await prisma.profile.upsert({
        where: { userId },
        create: { userId, talentVisible: visible },
        update: { talentVisible: visible },
        select: { talentVisible: true },
      });

      await recordSecurityEvent({
        type: 'TALENT_VISIBILITY_CHANGED',
        userId,
        route: 'PUT /privacy/talent-visibility',
        detail: visible ? 'visibility on' : 'visibility off',
      });

      res.json({ talentVisibility: { visible: profile.talentVisible } });
    } catch (error) {
      next(error);
    }
  },
);

privacyRouter.get(
  '/privacy/guardian-consent',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const [status, consent] = await Promise.all([
        getAgeStatus(userId),
        prisma.guardianConsent.findUnique({
          where: { userId },
          select: { guardianName: true, guardianContact: true, confirmedAt: true },
        }),
      ]);

      res.json({
        guardianConsent: {
          required: status.minor,
          age: status.age,
          hasDateOfBirth: status.dateOfBirth !== null,
          consent,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

privacyRouter.put(
  '/privacy/guardian-consent',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const input = guardianConsentSchema.parse(req.body);
      const status = await getAgeStatus(userId);

      if (!status.dateOfBirth || status.age === null) {
        return next(unprocessable('add your date of birth before recording guardian consent'));
      }
      if (!status.minor) {
        return next(unprocessable('guardian consent is only required for learners under 18'));
      }

      const consent = await prisma.guardianConsent.upsert({
        where: { userId },
        create: {
          userId,
          guardianName: input.guardianName,
          guardianContact: input.guardianContact,
        },
        update: {
          guardianName: input.guardianName,
          guardianContact: input.guardianContact,
          confirmedAt: new Date(),
        },
        select: { guardianName: true, guardianContact: true, confirmedAt: true },
      });

      await recordSecurityEvent({
        type: 'GUARDIAN_CONSENT_RECORDED',
        userId,
        route: 'PUT /privacy/guardian-consent',
        detail: 'guardian consent recorded',
      });

      res.json({ guardianConsent: { required: true, age: status.age, consent } });
    } catch (error) {
      next(error);
    }
  },
);

privacyRouter.get('/privacy/consents', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const consents = await prisma.consent.findMany({
      where: { userId },
      orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        purpose: true,
        policyVersion: true,
        grantedAt: true,
        revokedAt: true,
      },
    });

    res.json({
      consents,
      active: consents.filter((consent) => consent.revokedAt === null),
    });
  } catch (error) {
    next(error);
  }
});

privacyRouter.post('/privacy/consents', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const parsed = ConsentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(badRequest('send { "purpose": "...", "granted": true|false }'));
    }

    const { purpose, granted, policyVersion } = parsed.data;

    if (granted) {
      const active = await prisma.consent.findFirst({
        where: { userId, purpose, revokedAt: null },
        orderBy: { grantedAt: 'desc' },
      });

      // Repeating the same grant is not new evidence. A new policy version replaces the
      // active record, but the old row is closed rather than overwritten.
      if (active && active.policyVersion === policyVersion) {
        return res.json({ consent: active, active: true });
      }

      const consent = await prisma.$transaction(async (tx) => {
        if (active) {
          await tx.consent.update({
            where: { id: active.id },
            data: { revokedAt: new Date() },
          });
        }
        return tx.consent.create({
          data: { userId, purpose, policyVersion },
          select: {
            id: true,
            purpose: true,
            policyVersion: true,
            grantedAt: true,
            revokedAt: true,
          },
        });
      });

      await recordSecurityEvent({
        type: 'CONSENT_UPDATED',
        userId,
        route: 'POST /privacy/consents',
        detail: `${purpose} granted ${policyVersion}`,
      });

      return res.status(201).json({ consent, active: true });
    }

    const revoked = await prisma.consent.updateMany({
      where: { userId, purpose, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordSecurityEvent({
      type: 'CONSENT_UPDATED',
      userId,
      route: 'POST /privacy/consents',
      detail: `${purpose} revoked`,
    });

    res.json({ revoked: revoked.count, active: false });
  } catch (error) {
    next(error);
  }
});

privacyRouter.get('/privacy/export', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;

    const [
      user,
      profile,
      preferences,
      marks,
      applications,
      expenses,
      budgets,
      moneyPlan,
      studyPlans,
      bookings,
      messages,
      guardianConsent,
      consents,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
      }),
      prisma.profile.findUnique({ where: { userId } }),
      prisma.preference.findUnique({ where: { userId } }),
      prisma.subjectMark.findMany({
        where: { userId },
        select: { subject: true, mark: true, isHomeLanguage: true },
      }),
      prisma.application.findMany({
        where: { userId },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          createdAt: true,
          course: { select: { name: true, institution: { select: { name: true } } } },
          documents: { select: { filename: true, mimeType: true, size: true, uploadedAt: true } },
          offerLetter: { select: { filename: true, sentAt: true } },
        },
      }),
      prisma.expense.findMany({
        where: { userId },
        select: { category: true, amountCents: true, description: true, remindMe: true, spentAt: true },
      }),
      prisma.budget.findMany({
        where: { userId },
        select: { category: true, amountCents: true, period: true },
      }),
      prisma.moneyPlan.findUnique({
        where: { userId },
        select: { paydayDay: true },
      }),
      prisma.studyPlan.findMany({
        where: { userId },
        select: { title: true, approved: true, blocks: true, createdAt: true },
      }),
      prisma.booking.findMany({
        where: { userId },
        select: {
          status: true,
          reason: true,
          createdAt: true,
          slot: { select: { topic: true, startsAt: true, endsAt: true } },
        },
      }),
      prisma.message.findMany({
        where: { userId },
        select: { body: true, createdAt: true, community: { select: { name: true } } },
      }),
      prisma.guardianConsent.findUnique({
        where: { userId },
        select: { guardianName: true, guardianContact: true, confirmedAt: true },
      }),
      prisma.consent.findMany({
        where: { userId },
        orderBy: { grantedAt: 'asc' },
        select: { purpose: true, policyVersion: true, grantedAt: true, revokedAt: true },
      }),
    ]);

    if (!user) {
      return next(badRequest('account not found'));
    }

    // Deliberately omit: encrypted ID-number columns, password/account tokens, sessions,
    // security events and audit rows. The export is the learner's own content, not the
    // platform's security record of them.
    const payload = {
      exportedAt: new Date().toISOString(),
      account: user,
      profile: profile
        ? {
            fullName: profile.fullName,
            phone: profile.phone,
            province: profile.province,
            qualificationStatus: profile.qualificationStatus,
            grade: profile.grade,
            schoolQualification: profile.schoolQualification,
            interests: profile.interests,
            dateOfBirth: profile.dateOfBirth,
            consentedAt: profile.consentedAt,
            talentVisible: profile.talentVisible,
          }
        : null,
      preferences: preferences
        ? {
            fields: preferences.fields,
            provinces: preferences.provinces,
            budgetCeiling: preferences.budgetCeiling,
            studyMode: preferences.studyMode,
            language: preferences.language,
            lowDataMode: preferences.lowDataMode,
          }
        : null,
      marks,
      applications,
      expenses: expenses.map((expense) => ({
        ...expense,
        amount: expense.amountCents / 100,
        amountCents: undefined,
      })),
      budgets: budgets.map((budget) => ({
        ...budget,
        amount: budget.amountCents / 100,
        amountCents: undefined,
      })),
      moneyPlan,
      studyPlans,
      bookings,
      messages,
      guardianConsent,
      consents,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="iskole-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    next(error);
  }
});

privacyRouter.delete('/privacy/account', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const parsed = DeleteAccountSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(badRequest('send { "confirm": "DELETE" } to close the account'));
    }

    // Record before deleting: the security event's userId is set to null on cascade, but
    // the type and timestamp still show that a deletion happened.
    await recordSecurityEvent({
      type: 'ACCOUNT_DELETED',
      userId,
      route: 'DELETE /privacy/account',
      detail: 'account closed by owner',
    });

    // File contents live on disk, so the database cascade alone would leave them behind.
    // Collect the keys first, then delete the rows, then remove the bytes. A failure to
    // unlink is logged as part of the best-effort cleanup and does not block the deletion.
    const documents = await prisma.document.findMany({
      where: { application: { userId } },
      select: { key: true },
    });

    await prisma.user.delete({ where: { id: userId } });

    await Promise.allSettled(documents.map((document) => removeStoredDocument(document.key)));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
