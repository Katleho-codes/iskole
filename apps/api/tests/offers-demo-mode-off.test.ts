/**
 * The demo-only simulation must disappear when DEMO_MODE is off.
 *
 * This lives in its own file because the environment is read once when the API module graph
 * loads. Stubbing DEMO_MODE here and importing the app afterwards is the only way to test the
 * real configuration branch rather than mocking the route.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.stubEnv('DEMO_MODE', 'false');

const { createApp } = await import('../src/app');
const { prisma } = await import('../src/lib/prisma');
const { createTestUser } = await import('./helpers');

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('demo mode off', () => {
  it('returns 404 for the simulated review route even for the application owner', async () => {
    const learner = await createTestUser();
    const institution = await prisma.institution.create({
      data: {
        name: `No Demo Institution ${randomUUID()}`,
        province: 'GAUTENG',
        type: 'UNIVERSITY',
      },
    });
    const course = await prisma.course.create({
      data: {
        institutionId: institution.id,
        name: 'No Demo Course',
        field: 'BUSINESS',
        apsMin: 0,
      },
    });
    const application = await prisma.application.create({
      data: {
        userId: learner.id,
        courseId: course.id,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    const response = await request(app)
      .post(`/api/applications/${application.id}/simulate-review`)
      .set('Cookie', learner.cookie ?? '')
      .set('Idempotency-Key', `demo-off-${randomUUID()}`)
      .send({});

    expect(response.status).toBe(404);
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.status,
    ).toBe('SUBMITTED');
    expect(await prisma.offerLetter.count({ where: { applicationId: application.id } })).toBe(0);
  });

  it('returns 404 for the demo nudge trigger', async () => {
    const learner = await createTestUser();

    const response = await request(app)
      .post('/api/demo/run-nudges')
      .set('Cookie', learner.cookie ?? '')
      .send({});

    expect(response.status).toBe(404);
    expect(await prisma.notification.count({ where: { userId: learner.id } })).toBe(0);
  });
});
