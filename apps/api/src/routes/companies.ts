/**
 * Company access to learner talent.
 *
 * A COMPANY role is necessary but not sufficient. An administrator creates the role, then a
 * moderator approves the company here. Until `CompanyProfile.approved` is true, candidate
 * search returns 403, so a role change alone never exposes learner data.
 *
 * The candidate payload is built from an explicit select list and deliberately contains no
 * email, phone number, ID number or full profile record. Only learners who turned on
 * `talentVisible` are eligible. That switch is opt-in and off by default.
 */
import { Router } from 'express';
import { adultCutoff, calculateAps } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, unprocessable } from '../lib/http-error';
import { recordSecurityEvent } from '../lib/security-events';

export const companiesRouter = Router();

/** Shared check so every company route uses the same definition of "approved". */
async function isApprovedCompany(userId: string): Promise<boolean> {
  const profile = await prisma.companyProfile.findUnique({
    where: { userId },
    select: { approved: true },
  });
  return profile?.approved === true;
}

companiesRouter.get(
  '/company/candidates',
  requireSession,
  requireRole('COMPANY'),
  async (req, res, next) => {
    try {
      if (!(await isApprovedCompany(req.authUser!.id))) {
        return next(forbidden('company account is awaiting approval'));
      }

      // Opt-in only. The select list is explicit so adding a column to Profile cannot
      // silently start sending contact details to companies.
      //
      // Two filters protect minors: `talentVisible` is the learner's opt-in, and the date of
      // birth must be 18 years ago or earlier. A profile with no date of birth is excluded
      // rather than assumed adult, so "unknown" never becomes visible.
      const profiles = await prisma.profile.findMany({
        where: {
          talentVisible: true,
          dateOfBirth: { lte: adultCutoff() },
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
          fullName: true,
          province: true,
          qualificationStatus: true,
          interests: true,
          user: {
            select: {
              role: true,
              preferences: {
                select: { fields: true, provinces: true, studyMode: true },
              },
              subjectMarks: {
                select: { subject: true, mark: true, isHomeLanguage: true },
              },
            },
          },
        },
      });

      const candidates = profiles
        .filter((profile) => profile.user.role === 'STUDENT')
        .map((profile) => {
          const aps = calculateAps({
            marks: profile.user.subjectMarks.map((mark) => ({
              subject: mark.subject,
              mark: mark.mark,
              isHomeLanguage: mark.isHomeLanguage,
            })),
          });

          return {
            displayName: profile.fullName,
            province: profile.province,
            qualificationStatus: profile.qualificationStatus,
            interests: profile.interests,
            fields: profile.user.preferences?.fields ?? [],
            studyMode: profile.user.preferences?.studyMode ?? null,
            apsScore: aps.score,
            apsMax: aps.maxScore,
          };
        });

      res.json({ candidates });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Moderator approval. Idempotent: approving an already-approved company refreshes the
 * timestamp rather than failing, so a retry after a dropped response is harmless.
 *
 * The audit row records who approved whom. It contains ids and an action, no learner data.
 */
companiesRouter.post(
  '/admin/companies/:userId/approve',
  requireSession,
  requireRole('MODERATOR', 'ADMIN'),
  async (req, res, next) => {
    try {
      const userId = String(req.params.userId);
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!target) {
        return next(notFound('account not found'));
      }
      if (target.role !== 'COMPANY') {
        return next(unprocessable('account is not a company account'));
      }

      const approvedAt = new Date();
      const profile = await prisma.companyProfile.upsert({
        where: { userId },
        create: { userId, approved: true, approvedAt },
        update: { approved: true, approvedAt },
        select: { userId: true, approved: true, approvedAt: true },
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.authUser!.id,
          action: 'COMPANY_APPROVED',
          entity: 'companyProfile',
          entityId: userId,
        },
      });

      await recordSecurityEvent({
        type: 'MODERATOR_ACTION',
        userId: req.authUser!.id,
        route: `${req.method} ${req.path}`,
        detail: 'company approved',
      });

      res.json({ company: profile });
    } catch (error) {
      next(error);
    }
  },
);
