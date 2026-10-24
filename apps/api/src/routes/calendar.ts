/**
 * GET /api/calendar: one owner-scoped read for the calendar page.
 *
 * The response merges three kinds of real data that already belong to the learner:
 * approved study blocks, funding deadlines and confirmed clinic bookings. It does not invent
 * deadlines and does not include another learner's rows. `to` is exclusive, which makes
 * week and month windows easy to page without double-counting midnight events.
 */
import { Router } from 'express';
import {
  CalendarQuerySchema,
  johannesburgDateKey,
  johannesburgLocalToUtc,
  type CalendarEvent,
} from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calendarStats, makeStudyEvents } from '../lib/calendar';

export const calendarRouter = Router();

calendarRouter.get('/calendar', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const query = CalendarQuerySchema.parse(req.query);
    const from = new Date(query.from);
    const to = new Date(query.to);

    const [plan, funding, bookings] = await Promise.all([
      prisma.studyPlan.findFirst({
        where: { userId, approved: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.fundingOption.findMany({
        where: { isActive: true, deadline: { gte: from, lt: to } },
        orderBy: { deadline: 'asc' },
      }),
      prisma.booking.findMany({
        where: {
          userId,
          status: 'CONFIRMED',
          slot: { startsAt: { gte: from, lt: to } },
        },
        include: { slot: true },
        orderBy: { slot: { startsAt: 'asc' } },
      }),
    ]);

    const studyEvents = plan ? makeStudyEvents([plan], from, to) : [];

    const fundingEvents: CalendarEvent[] = funding.map((option) => {
      const dateKey = johannesburgDateKey(option.deadline!);
      const start = johannesburgLocalToUtc(dateKey, '00:00');
      return {
        id: `funding:${option.id}`,
        kind: 'FUNDING',
        title: `${option.name} closes`,
        start: start.toISOString(),
        end: new Date(start.getTime() + 86_400_000).toISOString(),
        allDay: true,
        status: 'OPEN',
        notes: option.provider,
        href: '/funding',
      };
    });

    const clinicEvents: CalendarEvent[] = bookings.map((booking) => ({
      id: `clinic:${booking.id}`,
      kind: 'CLINIC',
      title: booking.slot.topic,
      start: booking.slot.startsAt.toISOString(),
      end: booking.slot.endsAt.toISOString(),
      allDay: false,
      status: 'OPEN',
      notes: 'Clinic booking',
      href: '/wellness',
    }));

    const events = [...studyEvents, ...fundingEvents, ...clinicEvents].sort((a, b) =>
      a.start.localeCompare(b.start),
    );

    res.json({
      timezone: 'Africa/Johannesburg',
      from: from.toISOString(),
      to: to.toISOString(),
      planId: plan?.id ?? null,
      events,
      stats: calendarStats(studyEvents),
    });
  } catch (error) {
    next(error);
  }
});
