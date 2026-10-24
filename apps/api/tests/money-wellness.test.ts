/**
 * M5 money, nudges and wellness contract.
 *
 * The nudge runners are called with a fixed `now` so payday and month-boundary behaviour is
 * deterministic. Each test uses real rows and the real API app; no job scheduler is started.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  paydayDedupeKey,
  runDeadlineNudges,
  runPaydayNudges,
  runStudyBlockNudges,
} from '../src/lib/nudges';
import { createTestUser } from './helpers';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('money plan, expenses and budgets', () => {
  it('defaults payday, stores 0 as last day, and rejects an impossible day', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    const initial = await request(app).get('/api/money/plan').set('Cookie', cookie);
    expect(initial.status).toBe(200);
    expect(initial.body.plan.paydayDay).toBe(25);

    const updated = await request(app)
      .put('/api/money/plan')
      .set('Cookie', cookie)
      .send({ paydayDay: 0 });
    expect(updated.status).toBe(200);
    expect(updated.body.plan.paydayDay).toBe(0);

    const invalid = await request(app)
      .put('/api/money/plan')
      .set('Cookie', cookie)
      .send({ paydayDay: 32 });
    expect(invalid.status).toBe(400);

    const other = await createTestUser();
    expect((await request(app).get('/api/money/plan').set('Cookie', other.cookie ?? '')).status).toBe(
      200,
    );
    expect((await request(app).get('/api/money/plan')).status).toBe(401);
  });

  it('stores rands as cents, returns the remind flag and scopes deletion to the owner', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    const created = await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie)
      .set('Idempotency-Key', `expense-${Date.now()}`)
      .send({
        category: 'Food',
        amount: 12.5,
        description: 'Lunch',
        remindMe: true,
        date: '2026-10-20',
      });

    expect(created.status).toBe(201);
    expect(created.body.expense).toMatchObject({ category: 'Food', amount: 12.5, remindMe: true });

    const list = await request(app).get('/api/expenses').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.expenses).toHaveLength(1);
    expect(list.body.expenses[0].remindMe).toBe(true);

    const other = await createTestUser();
    const forbiddenDelete = await request(app)
      .delete(`/api/expenses/${created.body.expense.id}`)
      .set('Cookie', other.cookie ?? '');
    expect(forbiddenDelete.status).toBe(404);
    expect(await prisma.expense.count({ where: { userId: learner.id } })).toBe(1);

    const deleted = await request(app)
      .delete(`/api/expenses/${created.body.expense.id}`)
      .set('Cookie', cookie);
    expect(deleted.status).toBe(204);
    expect(await prisma.expense.count({ where: { userId: learner.id } })).toBe(0);
  });

  it('upserts one budget per category and period, then deletes it', async () => {
    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    const first = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .set('Idempotency-Key', `budget-a-${Date.now()}`)
      .send({ category: 'Food', amount: 500, period: 'MONTHLY' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .set('Idempotency-Key', `budget-b-${Date.now()}`)
      .send({ category: 'Food', amount: 650, period: 'MONTHLY' });
    expect(second.status).toBe(201);

    const list = await request(app).get('/api/budgets').set('Cookie', cookie);
    expect(list.body.budgets).toHaveLength(1);
    expect(list.body.budgets[0].amount).toBe(650);

    const deleted = await request(app)
      .delete(`/api/budgets/${second.body.budget.id}`)
      .set('Cookie', cookie);
    expect(deleted.status).toBe(204);
  });
});

describe('payday nudge', () => {
  it('writes one deduplicated notification with amounts and categories only', async () => {
    const learner = await createTestUser();
    const now = new Date('2026-10-25T05:00:00.000Z');
    await prisma.moneyPlan.create({ data: { userId: learner.id, paydayDay: 25 } });
    await prisma.expense.create({
      data: {
        userId: learner.id,
        category: 'Food',
        amountCents: 12_500,
        description: 'Lunch',
        remindMe: true,
        spentAt: new Date('2026-10-20T10:00:00.000Z'),
      },
    });
    await prisma.budget.create({
      data: { userId: learner.id, category: 'Food', amountCents: 50_000, period: 'MONTHLY' },
    });

    await runPaydayNudges(now);
    await runPaydayNudges(now);

    const notifications = await prisma.notification.findMany({ where: { userId: learner.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.dedupeKey).toBe(paydayDedupeKey('2026-10-25'));
    expect(notifications[0]?.body).toContain('R125.00');
    expect(notifications[0]?.body).toContain('Food');
    expect(notifications[0]?.body).not.toContain(learner.email);
    expect(notifications[0]?.body.toLowerCase()).not.toContain('id number');
  });

  it('treats the 31st as the last day of February', async () => {
    const learner = await createTestUser();
    await prisma.moneyPlan.create({ data: { userId: learner.id, paydayDay: 31 } });

    await runPaydayNudges(new Date('2026-02-27T06:00:00.000Z'));
    expect(await prisma.notification.count({ where: { userId: learner.id } })).toBe(0);

    await runPaydayNudges(new Date('2026-02-28T06:00:00.000Z'));
    const notifications = await prisma.notification.findMany({ where: { userId: learner.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.dedupeKey).toBe('payday:2026-02-28');
  });

  it('does nothing for a deleted user', async () => {
    const learner = await createTestUser();
    await prisma.moneyPlan.create({ data: { userId: learner.id, paydayDay: 25 } });
    await prisma.user.delete({ where: { id: learner.id } });

    await runPaydayNudges(new Date('2026-10-25T05:00:00.000Z'));
    expect(await prisma.notification.count({ where: { userId: learner.id } })).toBe(0);
  });
});

describe('deadline and study nudges', () => {
  it('notifies saved funding closing within seven days, once', async () => {
    const learner = await createTestUser();
    const now = new Date('2026-10-23T06:00:00.000Z');
    const option = await prisma.fundingOption.create({
      data: {
        name: `Deadline test ${Date.now()}`,
        provider: 'Test provider',
        type: 'BURSARY',
        deadline: new Date('2026-10-27T12:00:00.000Z'),
      },
    });
    await prisma.savedFunding.create({ data: { userId: learner.id, fundingOptionId: option.id } });

    await runDeadlineNudges(now);
    await runDeadlineNudges(now);

    const notifications = await prisma.notification.findMany({
      where: { userId: learner.id, type: 'DEADLINE' },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).not.toContain(learner.email);
  });

  it('notifies an approved study block starting within half an hour, once', async () => {
    const learner = await createTestUser();
    const now = new Date('2026-10-26T06:00:00.000Z'); // Monday 08:00 in Johannesburg.
    await prisma.studyPlan.create({
      data: {
        userId: learner.id,
        title: 'Nudge plan',
        approved: true,
        blocks: [
          {
            id: 'nudge-block',
            day: 'MONDAY',
            task: 'Practise algebra',
            startTime: '08:15',
            durationMinutes: 60,
            kind: 'STUDY',
            moduleCode: 'MATH',
            completedDates: [],
            skippedDates: [],
            status: 'PLANNED',
          },
        ],
      },
    });

    await runStudyBlockNudges(now);
    await runStudyBlockNudges(now);

    const notifications = await prisma.notification.findMany({
      where: { userId: learner.id, type: 'STUDY' },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toContain('08:15');
  });

  it('skips a block already marked done for that date', async () => {
    const learner = await createTestUser();
    const now = new Date('2026-10-26T06:00:00.000Z');
    await prisma.studyPlan.create({
      data: {
        userId: learner.id,
        title: 'Done plan',
        approved: true,
        blocks: [
          {
            id: 'done-block',
            day: 'MONDAY',
            task: 'Already done',
            startTime: '08:15',
            durationMinutes: 60,
            kind: 'STUDY',
            moduleCode: 'MATH',
            completedDates: ['2026-10-26'],
            skippedDates: [],
            status: 'PLANNED',
          },
        ],
      },
    });

    await runStudyBlockNudges(now);
    expect(await prisma.notification.count({ where: { userId: learner.id, type: 'STUDY' } })).toBe(0);
  });
});

describe('clinic booking and cancellation', () => {
  async function futureSlot(capacity = 2) {
    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    return prisma.clinicSlot.create({
      data: {
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        topic: `Clinic ${Date.now()}-${Math.random()}`,
        capacity,
      },
    });
  }

  it('books with a fixed-list reason and lists it for the owner only', async () => {
    const learner = await createTestUser();
    const other = await createTestUser();
    const slot = await futureSlot();

    const created = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', `clinic-${Date.now()}`)
      .send({ slotId: slot.id, reason: 'FUNDING' });
    expect(created.status).toBe(201);
    expect(created.body.booking.reason).toBe('FUNDING');

    const invalidReason = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', other.cookie ?? '')
      .set('Idempotency-Key', `clinic-bad-${Date.now()}`)
      .send({ slotId: slot.id, reason: 'anxious about exams' });
    expect(invalidReason.status).toBe(400);

    const mine = await request(app).get('/api/clinic/bookings').set('Cookie', learner.cookie ?? '');
    expect(mine.status).toBe(200);
    expect(mine.body.bookings).toHaveLength(1);
    expect(mine.body.bookings[0].reason).toBe('FUNDING');

    const theirs = await request(app).get('/api/clinic/bookings').set('Cookie', other.cookie ?? '');
    expect(theirs.body.bookings).toHaveLength(0);
  });

  it('refuses a full slot and a second booking by the same learner', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    const slot = await futureSlot(1);

    const booked = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', first.cookie ?? '')
      .set('Idempotency-Key', `capacity-a-${Date.now()}`)
      .send({ slotId: slot.id, reason: 'STUDY_SKILLS' });
    expect(booked.status).toBe(201);

    const full = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', second.cookie ?? '')
      .set('Idempotency-Key', `capacity-b-${Date.now()}`)
      .send({ slotId: slot.id, reason: 'STUDY_SKILLS' });
    expect(full.status).toBe(409);

    const duplicate = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', first.cookie ?? '')
      .set('Idempotency-Key', `capacity-c-${Date.now()}`)
      .send({ slotId: slot.id, reason: 'STUDY_SKILLS' });
    expect(duplicate.status).toBe(409);
  });

  it('cancels only the owner booking and is idempotent on repeat', async () => {
    const learner = await createTestUser();
    const other = await createTestUser();
    const slot = await futureSlot();

    const created = await request(app)
      .post('/api/clinic/bookings')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', `cancel-${Date.now()}`)
      .send({ slotId: slot.id, reason: 'REGISTRATION' });
    const bookingId = created.body.booking.id as string;

    const forbidden = await request(app)
      .delete(`/api/clinic/bookings/${bookingId}`)
      .set('Cookie', other.cookie ?? '');
    expect(forbidden.status).toBe(403);

    const cancelled = await request(app)
      .delete(`/api/clinic/bookings/${bookingId}`)
      .set('Cookie', learner.cookie ?? '');
    expect(cancelled.status).toBe(204);

    const replay = await request(app)
      .delete(`/api/clinic/bookings/${bookingId}`)
      .set('Cookie', learner.cookie ?? '');
    expect(replay.status).toBe(204);

    const row = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(row?.status).toBe('CANCELLED');
  });
});
