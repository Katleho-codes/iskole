/**
 * The golden path, end to end, in one test.
 *
 * A learner signs up (through the real session helper), completes a profile, adds marks,
 * sees an APS, sets preferences, gets course matches, compares funding, creates an
 * application and submits it. Each step asserts the response shape the web app consumes, so
 * a change that breaks the journey fails here before it reaches a demo.
 *
 * The AI transport is forced to fail. That is deliberate: matching must still return the
 * deterministic shortlist if the provider is down, and the test would otherwise depend on a
 * network service.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setTransportForTests } from '../src/lib/ai/client';
import { prisma } from '../src/lib/prisma';
import { createTestUser } from './helpers';

const app = createApp();

afterAll(() => {
  __setTransportForTests(null);
});

describe('golden path', () => {
  it('walks a learner from profile to a submitted application', async () => {
    __setTransportForTests(async () => new Response('provider down', { status: 503 }));

    const learner = await createTestUser();
    const cookie = learner.cookie ?? '';

    // 1. Profile.
    const blank = await request(app).get('/api/profile').set('Cookie', cookie);
    expect(blank.status).toBe(200);
    expect(blank.body.profile.fullName).toBeNull();

    const profile = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({
        fullName: 'Golden Path Learner',
        province: 'GAUTENG',
        qualificationStatus: 'COMPLETED_SCHOOL',
        grade: 12,
        schoolQualification: 'NSC',
        interests: 'Teaching and community work',
        dateOfBirth: '2000-01-01',
      });
    expect(profile.status).toBe(200);
    expect(profile.body.profile.fullName).toBe('Golden Path Learner');
    expect(profile.body.profile.province).toBe('GAUTENG');
    expect(profile.body.profile.dateOfBirth).toBe('2000-01-01');

    // 2. Marks. A mixed list so the APS calculator has something to exclude and count.
    const subjects = [
      { subject: 'Mathematics', mark: 75, isHomeLanguage: false },
      { subject: 'Physical Sciences', mark: 70, isHomeLanguage: false },
      { subject: 'English Home Language', mark: 65, isHomeLanguage: true },
      { subject: 'Life Orientation', mark: 80, isHomeLanguage: false },
      { subject: 'Life Sciences', mark: 68, isHomeLanguage: false },
      { subject: 'Geography', mark: 72, isHomeLanguage: false },
    ];

    for (const subject of subjects) {
      const saved = await request(app)
        .post('/api/marks')
        .set('Cookie', cookie)
        .set('Idempotency-Key', `mark-${subject.subject}`)
        .send(subject);
      expect(saved.status).toBe(201);
    }

    // 3. APS.
    const aps = await request(app).get('/api/aps').set('Cookie', cookie);
    expect(aps.status).toBe(200);
    expect(aps.body.aps.score).toBeGreaterThan(0);
    expect(aps.body.aps.counted.length).toBeGreaterThan(0);
    expect(aps.body.aps.excluded.some((item: { reason: string }) => item.reason === 'LIFE_ORIENTATION')).toBe(
      true,
    );

    // 4. Study preferences.
    const preferences = await request(app)
      .put('/api/preferences')
      .set('Cookie', cookie)
      .send({
        fields: ['EDUCATION'],
        provinces: ['GAUTENG'],
        budgetCeiling: 60_000,
        studyMode: 'FULL_TIME',
        language: 'en',
        lowDataMode: false,
      });
    expect(preferences.status).toBe(200);
    expect(preferences.body.preferences.fields).toEqual(['EDUCATION']);

    // 5. A course to match and apply to. Created directly because the test database is not
    //    seeded; the API under test is still the only path that reads it.
    //
    //    The test database persists between runs, so remove institutions this test created
    //    previously (their courses and applications cascade). Otherwise old candidates fill
    //    the match query's 50-row cap and the new course can fall outside it.
    await prisma.institution.deleteMany({
      where: { name: { startsWith: 'Golden Institution' } },
    });
    const institution = await prisma.institution.create({
      data: {
        name: 'Golden Institution',
        province: 'GAUTENG',
        type: 'UNIVERSITY',
      },
    });
    const course = await prisma.course.create({
      data: {
        institutionId: institution.id,
        name: 'Bachelor of Education',
        code: `BED-${randomUUID().slice(0, 8)}`,
        field: 'EDUCATION',
        qualification: 'BACHELOR',
        apsMin: 20,
        tuitionMin: 30_000,
        tuitionMax: 50_000,
      },
    });

    const match = await request(app)
      .post('/api/match')
      .set('Cookie', cookie)
      .send({});
    expect(match.status).toBe(200);
    expect(Array.isArray(match.body.recommendations)).toBe(true);

    const recommendation = match.body.recommendations.find(
      (item: { course: { id: string } }) => item.course.id === course.id,
    );
    expect(recommendation).toBeDefined();
    expect(recommendation.why.length).toBeGreaterThan(0);
    expect(recommendation.aiEnhanced).toBe(false);

    // 6. Funding list and comparison.
    const funding = await prisma.fundingOption.create({
      data: {
        name: `Golden Bursary ${randomUUID()}`,
        provider: 'Sample Provider',
        type: 'BURSARY',
        description: 'Sample, verify before use.',
        coversTuition: true,
        coversBooks: true,
        amountMin: 10_000,
        amountMax: 40_000,
        isActive: true,
      },
    });

    const fundingList = await request(app).get('/api/funding');
    expect(fundingList.status).toBe(200);
    expect(
      fundingList.body.fundingOptions.some((item: { id: string }) => item.id === funding.id),
    ).toBe(true);

    const compare = await request(app).get(`/api/funding/compare?ids=${funding.id}`);
    expect(compare.status).toBe(200);
    expect(compare.body.fundingOptions).toHaveLength(1);

    // 7. Application: create is idempotent.
    const createKey = `golden-create-${course.id}`;
    const created = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .set('Idempotency-Key', createKey)
      .send({ courseId: course.id });
    expect(created.status).toBe(201);
    expect(created.body.application.status).toBe('DRAFT');

    const replay = await request(app)
      .post('/api/applications')
      .set('Cookie', cookie)
      .set('Idempotency-Key', createKey)
      .send({ courseId: course.id });
    expect(replay.status).toBe(201);
    expect(replay.body.application.id).toBe(created.body.application.id);
    expect(await prisma.application.count({ where: { userId: learner.id } })).toBe(1);

    // 8. Submit.
    const applicationId = created.body.application.id as string;
    const submitted = await request(app)
      .post(`/api/applications/${applicationId}/submit`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', `golden-submit-${applicationId}`)
      .send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.application.status).toBe('SUBMITTED');

    // 9. The list the applications screen reads reflects the submission.
    const list = await request(app).get('/api/applications').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.applications).toHaveLength(1);
    expect(list.body.applications[0].status).toBe('SUBMITTED');
    expect(list.body.applications[0].course.name).toBe('Bachelor of Education');
    expect(list.body.applications[0].events.length).toBeGreaterThan(0);
  });
});
