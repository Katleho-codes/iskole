/**
 * GET /api/dashboard: one owner-scoped read that powers Home.
 *
 * The dashboard is a read model, not a new source of truth. It aggregates rows the learner
 * already owns, and every count is computed from those rows. Nothing here is visible to a
 * company, moderator or another learner.
 */
import { Router } from 'express';
import {
  addDaysToDateKey,
  calculateAps,
  johannesburgDateKey,
  startOfWeekDateKey,
  studyDayForDateKey,
} from '@iskole/shared';
import { requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { normaliseStudyBlocks, statusForDate } from '../lib/study-blocks';

export const dashboardRouter = Router();

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function daysUntil(date: Date, now: Date) {
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

dashboardRouter.get('/dashboard', requireSession, async (req, res, next) => {
  const role = req.authUser!.role;

  if (role === 'ADMIN') {
    try {
      const [pendingCompanies, openReports, userCount, recentAuditLogs, recentUsers] = await Promise.all([
        prisma.companyProfile.count({ where: { approved: false } }),
        prisma.report.count({ where: { status: 'SUBMITTED' } }),
        prisma.user.count(),
        prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, action: true, entity: true, entityId: true, createdAt: true, actorId: true },
        }),
        prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        }),
      ]);

      return res.json({
        type: 'admin',
        admin: {
          pendingCompanies,
          openReports,
          userCount,
          recentAuditLogs,
          recentUsers,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  if (role !== 'STUDENT') {
    try {
      const [pendingCompanies, openReports, userCount] = await Promise.all([
        prisma.companyProfile.count({ where: { approved: false } }),
        prisma.report.count({ where: { status: 'SUBMITTED' } }),
        prisma.user.count(),
      ]);

      return res.json({
        type: 'admin',
        admin: {
          pendingCompanies,
          openReports,
          userCount,
          recentAuditLogs: [],
          recentUsers: [],
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  try {
    const userId = req.authUser!.id;
    const user = req.authUser!;
    const now = new Date();
    const monthStart = startOfMonth(now);

    const [profile, preferences, marks, applications, savedFunding, plans, expenses, budgets, fundingOptions, notifications] =
      await Promise.all([
        prisma.profile.findUnique({ where: { userId } }),
        prisma.preference.findUnique({ where: { userId } }),
        prisma.subjectMark.findMany({ where: { userId }, orderBy: { subject: 'asc' } }),
        prisma.application.findMany({
          where: { userId },
          include: {
            course: { include: { institution: true } },
            offerLetter: { select: { id: true, filename: true, sentAt: true } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.savedFunding.count({ where: { userId } }),
        prisma.studyPlan.findMany({
          where: { userId, approved: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        }),
        prisma.expense.aggregate({
          where: { userId, spentAt: { gte: monthStart } },
          _sum: { amountCents: true },
        }),
        prisma.budget.aggregate({
          where: { userId, period: 'MONTHLY' },
          _sum: { amountCents: true },
        }),
        prisma.fundingOption.findMany({
          where: { isActive: true, deadline: { gte: now } },
          orderBy: { deadline: 'asc' },
          take: 4,
        }),
        prisma.notification.findMany({
          where: { userId, readAt: null },
          orderBy: { createdAt: 'desc' },
          take: 3,
        }),
      ]);

    const aps = calculateAps({
      marks: marks.map((mark) => ({
        subject: mark.subject,
        mark: mark.mark,
        isHomeLanguage: mark.isHomeLanguage,
      })),
    });

    const profileComplete = Boolean(profile?.fullName && profile?.province && profile?.dateOfBirth);
    const marksComplete = marks.length > 0;
    const preferencesComplete = Boolean(preferences?.fields?.length);
    const matchReady = marksComplete && preferencesComplete;
    const fundingComplete = savedFunding > 0;
    const applyComplete = applications.length > 0;
    const offerComplete = applications.some((application) => application.offerLetter !== null);
    const studyComplete = plans.length > 0;

    const journey = [
      { key: 'profile', label: 'Profile', complete: profileComplete, href: '/profile' },
      { key: 'marks', label: 'Marks', complete: marksComplete, href: '/marks' },
      { key: 'match', label: 'Match', complete: matchReady, href: '/match' },
      { key: 'funding', label: 'Funding', complete: fundingComplete, href: '/funding' },
      { key: 'apply', label: 'Apply', complete: applyComplete, href: '/applications' },
      { key: 'offer', label: 'Offer', complete: offerComplete, href: '/offers' },
      { key: 'study', label: 'Study', complete: studyComplete, href: '/study-plan' },
    ];

    const nextStep =
      [
        {
          key: 'profile',
          title: 'Finish your starting point',
          body: 'Add your province and date of birth so we can check age, funding and provincial options.',
          href: '/profile',
          cta: 'Complete profile',
        },
        {
          key: 'marks',
          title: 'Add your marks',
          body: 'Your APS and subject requirements unlock course matches.',
          href: '/marks',
          cta: 'Add marks',
        },
        {
          key: 'match',
          title: 'See what fits',
          body: 'We will show courses you qualify for, why they fit and what to improve.',
          href: '/match',
          cta: 'Find matches',
        },
        {
          key: 'funding',
          title: 'Save funding options',
          body: 'Compare bursaries and see which deadlines are closest.',
          href: '/funding',
          cta: 'Browse funding',
        },
        {
          key: 'apply',
          title: 'Apply in one place',
          body: 'Start an application, upload only what is required and track every status.',
          href: '/match',
          cta: 'Find a course',
        },
        {
          key: 'offer',
          title: 'Watch for your offer',
          body: 'Offers appear here and in your email. You can accept or decline in the app.',
          href: '/offers',
          cta: 'View offers',
        },
        {
          key: 'study',
          title: 'Build a study week',
          body: 'Turn an offer into a weekly plan you can actually follow.',
          href: '/study-plan',
          cta: 'Create study plan',
        },
      ].find((step) => !journey.find((item) => item.key === step.key)?.complete) ?? {
        key: 'done',
        title: 'Everything is set up',
        body: 'Keep your study blocks moving and check your calendar for what is next.',
        href: '/calendar',
        cta: 'Open calendar',
      };

    const todayKey = johannesburgDateKey(now);
    const today = studyDayForDateKey(todayKey);
    const plan = plans[0];
    const blocks = plan ? normaliseStudyBlocks(plan.id, plan.blocks) : [];
    const todayBlocks = blocks
      .filter((block) => block.day === today)
      .map((block) => ({
        id: block.id,
        task: block.task,
        startTime: block.startTime,
        durationMinutes: block.durationMinutes,
        moduleCode: block.moduleCode ?? null,
        status: statusForDate(block, todayKey),
      }));

    const weekStartKey = startOfWeekDateKey(todayKey);
    let weeklyDone = 0;
    let weeklyConsidered = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const dateKey = addDaysToDateKey(weekStartKey, offset);
      const day = studyDayForDateKey(dateKey);
      for (const block of blocks) {
        if (block.day !== day) continue;
        const status = statusForDate(block, dateKey);
        if (status === 'DONE') {
          weeklyDone += 1;
          weeklyConsidered += 1;
        } else if (status === 'PLANNED') {
          weeklyConsidered += 1;
        }
      }
    }

    const deadlines = fundingOptions.map((option) => ({
      id: option.id,
      title: option.name,
      provider: option.provider,
      deadline: option.deadline?.toISOString() ?? null,
      daysLeft: option.deadline ? daysUntil(option.deadline, now) : null,
      href: '/funding',
    }));

    res.json({
      learner: {
        firstName: (user.name || 'there').trim().split(/\s+/)[0],
        fullName: user.name,
      },
      journey,
      nextStep,
      aps: { score: aps.score, maxScore: aps.maxScore, counted: aps.counted.length },
      today: {
        day: today,
        dateKey: todayKey,
        blocks: todayBlocks,
      },
      deadlines,
      applications: applications.slice(0, 5).map((application) => ({
        id: application.id,
        status: application.status,
        courseName: application.course.name,
        institution: application.course.institution.name,
        updatedAt: application.updatedAt.toISOString(),
      })),
      money: {
        spentCents: expenses._sum.amountCents ?? 0,
        budgetCents: budgets._sum.amountCents ?? 0,
        monthStart: monthStart.toISOString(),
      },
      notifications: notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        createdAt: notification.createdAt.toISOString(),
      })),
      stats: {
        applications: applications.length,
        savedFunding,
        offers: applications.filter((application) => application.offerLetter !== null).length,
        studyBlocksToday: todayBlocks.length,
        weeklyStudyDone: weeklyDone,
        weeklyStudyConsistency:
          weeklyConsidered === 0 ? 0 : Math.round((weeklyDone / weeklyConsidered) * 100),
      },
    });
  } catch (error) {
    next(error);
  }
});
