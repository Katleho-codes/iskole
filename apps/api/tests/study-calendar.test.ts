/**
 * M4 study plan and calendar contract.
 *
 * These tests use one real approved weekly plan and exercise the parts a learner actually
 * touches: the calendar window, moving a block, marking one occurrence done, adding/removing
 * a block, ownership, and the `.ics` export. The AI transport is forced down so the guided
 * creation path is also tested against its deterministic fallback.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import {
  johannesburgLocalToUtc,
  type StudyBlock,
} from '@iskole/shared';
import { createApp } from '../src/app';
import { __setTransportForTests } from '../src/lib/ai/client';
import { prisma } from '../src/lib/prisma';
import { createTestUser } from './helpers';

const app = createApp();

afterAll(() => {
  __setTransportForTests(null);
});

function block(overrides: Partial<StudyBlock> = {}): StudyBlock {
  return {
    id: 'block-1',
    day: 'MONDAY',
    task: 'Practise algebra',
    startTime: '17:00',
    durationMinutes: 60,
    kind: 'STUDY',
    moduleCode: 'MATH',
    completedDates: [],
    skippedDates: [],
    status: 'PLANNED',
    ...overrides,
  };
}

async function approvedPlan(userId: string, blocks: StudyBlock[] = [block()]) {
  return prisma.studyPlan.create({
    data: {
      userId,
      title: 'M4 test plan',
      approved: true,
      blocks,
    },
  });
}

const weekFrom = johannesburgLocalToUtc('2026-10-19', '00:00').toISOString();
const weekTo = johannesburgLocalToUtc('2026-10-26', '00:00').toISOString();

function calendarUrl(from = weekFrom, to = weekTo) {
  return `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

describe('GET /api/calendar', () => {
  it('requires a session and rejects an invalid or oversized window', async () => {
    expect((await request(app).get(calendarUrl())).status).toBe(401);

    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    const missing = await request(app).get('/api/calendar').set('Cookie', cookie);
    expect(missing.status).toBe(400);

    const backwards = await request(app)
      .get(calendarUrl(weekTo, weekFrom))
      .set('Cookie', cookie);
    expect(backwards.status).toBe(400);

    const tooLong = await request(app)
      .get(calendarUrl(weekFrom, johannesburgLocalToUtc('2027-01-01', '00:00').toISOString()))
      .set('Cookie', cookie);
    expect(tooLong.status).toBe(400);
  });

  it('expands approved weekly blocks in Johannesburg time and keeps other learners out', async () => {
    const learner = await createTestUser();
    await approvedPlan(learner.id);

    const res = await request(app).get(calendarUrl()).set('Cookie', learner.cookie ?? '');
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Africa/Johannesburg');

    const study = res.body.events.filter((event: { kind: string }) => event.kind === 'STUDY');
    expect(study).toHaveLength(1);
    expect(study[0].start).toBe('2026-10-19T15:00:00.000Z');
    expect(study[0].end).toBe('2026-10-19T16:00:00.000Z');
    expect(study[0].status).toBe('PLANNED');
    expect(res.body.stats).toMatchObject({ blocks: 1, planned: 1, done: 0, consistency: 0 });

    const other = await createTestUser();
    const otherCalendar = await request(app)
      .get(calendarUrl())
      .set('Cookie', other.cookie ?? '');
    expect(otherCalendar.status).toBe(200);
    // Funding deadlines are shared, so ownership is asserted on this learner's study blocks.
    expect(
      otherCalendar.body.events.filter((event: { kind: string }) => event.kind === 'STUDY'),
    ).toEqual([]);
  });

  it('merges funding deadlines and confirmed clinic bookings', async () => {
    const learner = await createTestUser();
    const deadline = johannesburgLocalToUtc('2026-10-21', '12:00');
    const option = await prisma.fundingOption.create({
      data: {
        name: `M4 bursary ${Date.now()}`,
        provider: 'Test provider',
        type: 'BURSARY',
        deadline,
      },
    });
    const slot = await prisma.clinicSlot.create({
      data: {
        startsAt: johannesburgLocalToUtc('2026-10-22', '16:00'),
        endsAt: johannesburgLocalToUtc('2026-10-22', '17:00'),
        // Slots are unique per start time and topic, so give this run its own topic.
        topic: `M4 clinic ${Date.now()}`,
        capacity: 3,
      },
    });
    await prisma.booking.create({
      data: { slotId: slot.id, userId: learner.id, status: 'CONFIRMED' },
    });

    const res = await request(app).get(calendarUrl()).set('Cookie', learner.cookie ?? '');
    expect(res.status).toBe(200);
    expect(res.body.events.some((event: { kind: string; title: string }) => event.kind === 'FUNDING' && event.title.includes(option.name))).toBe(
      true,
    );
    expect(res.body.events.some((event: { kind: string }) => event.kind === 'CLINIC')).toBe(true);
  });
});

describe('PATCH /api/study-plans/:id/blocks/:blockId', () => {
  it('marks one occurrence done and feeds the weekly consistency stat', async () => {
    const learner = await createTestUser();
    const plan = await approvedPlan(learner.id);

    const marked = await request(app)
      .patch(`/api/study-plans/${plan.id}/blocks/block-1`)
      .set('Cookie', learner.cookie ?? '')
      .send({ status: 'DONE', date: '2026-10-19' });
    expect(marked.status).toBe(200);
    expect(marked.body.block.completedDates).toContain('2026-10-19');
    expect(marked.body.block.status).toBe('DONE');

    const calendar = await request(app)
      .get(calendarUrl())
      .set('Cookie', learner.cookie ?? '');
    const event = calendar.body.events.find((item: { kind: string }) => item.kind === 'STUDY');
    expect(event.status).toBe('DONE');
    expect(calendar.body.stats.consistency).toBe(100);

    // Repeating the same patch is safe and does not duplicate the date.
    const replay = await request(app)
      .patch(`/api/study-plans/${plan.id}/blocks/block-1`)
      .set('Cookie', learner.cookie ?? '')
      .send({ status: 'DONE', date: '2026-10-19' });
    expect(replay.status).toBe(200);
    expect(replay.body.block.completedDates).toEqual(['2026-10-19']);
  });

  it('moves a block and rejects invalid changes or another owner', async () => {
    const learner = await createTestUser();
    const plan = await approvedPlan(learner.id);

    const moved = await request(app)
      .patch(`/api/study-plans/${plan.id}/blocks/block-1`)
      .set('Cookie', learner.cookie ?? '')
      .send({ day: 'TUESDAY', startTime: '18:00', durationMinutes: 90 });
    expect(moved.status).toBe(200);
    expect(moved.body.block.day).toBe('TUESDAY');

    const calendar = await request(app)
      .get(calendarUrl())
      .set('Cookie', learner.cookie ?? '');
    const event = calendar.body.events.find((item: { kind: string }) => item.kind === 'STUDY');
    expect(event.start).toBe('2026-10-20T16:00:00.000Z');
    expect(event.end).toBe('2026-10-20T17:30:00.000Z');

    const noDate = await request(app)
      .patch(`/api/study-plans/${plan.id}/blocks/block-1`)
      .set('Cookie', learner.cookie ?? '')
      .send({ status: 'DONE' });
    expect(noDate.status).toBe(400);

    const badTime = await request(app)
      .patch(`/api/study-plans/${plan.id}/blocks/block-1`)
      .set('Cookie', learner.cookie ?? '')
      .send({ startTime: '25:00' });
    expect(badTime.status).toBe(400);

    const other = await createTestUser();
    const forbidden = await request(app)
      .patch(`/api/study-plans/${plan.id}/blocks/block-1`)
      .set('Cookie', other.cookie ?? '')
      .send({ day: 'FRIDAY' });
    expect(forbidden.status).toBe(404);
  });
});

describe('study plan guided creation and block editing', () => {
  it('uses modules and availability in the deterministic fallback', async () => {
    __setTransportForTests(async () => new Response('provider down', { status: 503 }));
    const learner = await createTestUser();

    const created = await request(app)
      .post('/api/study-plans')
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', `guided-${Date.now()}`)
      .send({
        modules: [{ code: 'MATH101', name: 'Mathematics', difficulty: 5 }],
        availability: [{ day: 'SATURDAY', startTime: '09:00', endTime: '12:00' }],
      });

    expect(created.status).toBe(201);
    expect(created.body.studyPlan.blocks).toHaveLength(1);
    expect(created.body.studyPlan.blocks[0]).toMatchObject({
      day: 'SATURDAY',
      startTime: '09:00',
      moduleCode: 'MATH101',
      status: 'PLANNED',
    });
    expect(created.body.studyPlan.blocks[0].id).toBeTruthy();
  });

  it('adds and deletes a block, but refuses to empty the plan', async () => {
    const learner = await createTestUser();
    const plan = await approvedPlan(learner.id);
    const cookie = learner.cookie ?? '';

    const added = await request(app)
      .post(`/api/study-plans/${plan.id}/blocks`)
      .set('Cookie', cookie)
      .send({
        day: 'THURSDAY',
        task: 'Review trigonometry',
        startTime: '16:30',
        durationMinutes: 45,
        kind: 'REVISION',
      });
    expect(added.status).toBe(201);
    expect(added.body.block.startTime).toBe('16:30');

    const addedId = added.body.block.id as string;
    expect(
      (await request(app).delete(`/api/study-plans/${plan.id}/blocks/${addedId}`).set('Cookie', cookie))
        .status,
    ).toBe(204);

    expect(
      (await request(app).delete(`/api/study-plans/${plan.id}/blocks/block-1`).set('Cookie', cookie))
        .status,
    ).toBe(400);
  });
});

describe('ICS export', () => {
  it('exports approved blocks with UTC times and CRLF line endings', async () => {
    const learner = await createTestUser();
    const plan = await approvedPlan(learner.id);

    const ics = await request(app)
      .get(`/api/study-plans/${plan.id}/calendar.ics`)
      .set('Cookie', learner.cookie ?? '');
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VCALENDAR');
    expect(ics.text).toContain('RRULE:FREQ=WEEKLY;COUNT=12');
    expect(ics.text).toContain('DTSTART:');
    expect(ics.text).toContain('DTEND:');
    expect(ics.text).toContain('\r\n');
  });
});
