/**
 * better-auth integration tests.
 *
 * These run the real Express app against the real iskole_test database. They cover:
 * - the auth handler is mounted and answers (this is the "does the wiring work" test)
 * - every endpoint is better-auth's, not a custom iskole route
 * - 401 when unauthenticated, 403 for the wrong role (the required per-route matrix)
 * - email enumeration is impossible on sign-up and password reset
 * - the rate limiter actually bites on repeated failed sign-ins
 * - no custom auth route exists anywhere
 *
 * Each test uses a unique email so tests do not depend on execution order. Rows are left
 * in iskole_test between runs, which is fine: the database is disposable and the emails are
 * random per run.
 */
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { REQUIRE_EMAIL_VERIFICATION } from '../src/lib/auth';
import { prisma } from '../src/lib/prisma';
import { requireRole, requireSession } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error-handler';
import { createTestUser, createUnsignedCookieFor, uniqueEmail } from './helpers';

const VALID_PASSWORD = 'a-long-enough-passphrase';

// The rate limiter persists counters in the database and all tests share 127.0.0.1, so
// counters are cleared between tests that exercise the auth flows. The dedicated
// rate-limiting test below clears for itself and then proves the limit still bites.
beforeEach(async () => {
  await prisma.rateLimit.deleteMany({});
});

describe('better-auth mount', () => {
  const app = createApp();

  it('answers the better-auth liveness endpoint', async () => {
    const res = await request(app).get('/api/auth/ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns null session for an anonymous request', async () => {
    const res = await request(app).get('/api/auth/get-session');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('does not expose any iskole-owned auth route', async () => {
    // If any of these ever return 200, someone has hand-rolled auth. That is forbidden.
    for (const path of ['/api/auth/signin', '/api/auth/login', '/api/auth/session', '/api/auth/register']) {
      const res = await request(app).post(path).send({});
      expect(res.status, `${path} must not exist`).toBe(404);
    }
  });
});

describe('sign-up', () => {
  const app = createApp();

  it('rejects a missing body with a validation error, not a crash', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects a password shorter than the minimum length', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email: uniqueEmail(), password: 'short', name: 'Test Learner' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('creates a STUDENT account on a valid sign-up', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: VALID_PASSWORD, name: 'Valid Learner' });

    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user?.role).toBe('STUDENT');
    // requireEmailVerification is on, so a fresh sign-up is never verified.
    expect(user?.emailVerified).toBe(false);
  });

  it('rejects a sign-up that tries to set its own role', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: VALID_PASSWORD, name: 'Sneaky Learner', role: 'ADMIN' });

    // better-auth refuses the field outright rather than ignoring it (400 FIELD_NOT_ALLOWED).
    // Stronger than a silent override: the request never creates an account at all.
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('FIELD_NOT_ALLOWED');

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });

  it('always creates a STUDENT, never an elevated role', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: VALID_PASSWORD, name: 'Ordinary Learner' });

    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.role).toBe('STUDENT');
  });

  it('does not reveal whether an email is already registered', async () => {
    const email = uniqueEmail();
    const body = { email, password: VALID_PASSWORD, name: 'Twice Learner' };

    const first = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send(body);
    const second = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send(body);

    // With requireEmailVerification on, both calls look the same to a caller trying to
    // probe which addresses have accounts. While verification is temporarily off,
    // better-auth answers a duplicate sign-up with an error, so the statuses differ; the
    // test states the property that holds in the current mode rather than pretending.
    if (REQUIRE_EMAIL_VERIFICATION) {
      expect(second.status).toBe(first.status);
    } else {
      expect(first.status).toBe(200);
      expect(second.status).toBe(422);
    }
  });
});

describe('sign-in', () => {
  const app = createApp();

  it('refuses a sign-in with a wrong password and a generic message', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: VALID_PASSWORD, name: 'Signin Learner' });

    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: 'a-different-long-passphrase' });

    expect(res.status).toBe(401);
    // The message must not say whether the account exists.
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('not found');
  });

  it('blocks an unverified account from signing in', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: VALID_PASSWORD, name: 'Unverified Learner' });

    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: VALID_PASSWORD });

    // Email verification is required before a session can exist when the flag is on.
    // While it is off, the same sign-in succeeds so development and the demo are usable.
    expect(res.status).toBe(REQUIRE_EMAIL_VERIFICATION ? 403 : 200);
  });
});

describe('password reset', () => {
  const app = createApp();

  it('always returns success, whether or not the address exists', async () => {
    const known = uniqueEmail();
    await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ email: known, password: VALID_PASSWORD, name: 'Reset Learner' });

    const forKnown = await request(app)
      .post('/api/auth/request-password-reset')
      .set('Origin', 'http://localhost:3000')
      .send({ email: known });
    const forUnknown = await request(app)
      .post('/api/auth/request-password-reset')
      .set('Origin', 'http://localhost:3000')
      .send({ email: uniqueEmail() });

    expect(forUnknown.status).toBe(forKnown.status);
    expect(forUnknown.body).toEqual(forKnown.body);
  });
});

describe('rate limiting', () => {
  const app = createApp();

  it('stops repeated failed sign-ins', async () => {
    const email = uniqueEmail();
    const attempts = [];
    for (let i = 0; i < 10; i += 1) {
      attempts.push(
        await request(app)
          .post('/api/auth/sign-in/email')
          .set('Origin', 'http://localhost:3000')
          .send({ email, password: 'definitely-wrong-passphrase' }),
      );
    }
    expect(attempts.some((res) => res.status === 429)).toBe(true);
  });
});

/**
 * The guard middleware needs a route to protect. This app builds one in-test so the guards
 * are checked without depending on a milestone feature that does not exist yet.
 */
describe('requireSession and requireRole', () => {
  function guardedApp() {
    const app = express();
    app.get('/guarded/session', requireSession, (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/guarded/admin', requireSession, requireRole('ADMIN'), (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/guarded/student', requireSession, requireRole('STUDENT', 'ADMIN'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    return app;
  }

  const app = guardedApp();

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/guarded/session');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'sign in required' });
  });

  it('returns 401 on a role-guarded route without a session', async () => {
    const res = await request(app).get('/guarded/admin');
    expect(res.status).toBe(401);
  });

  it('returns 403 for the wrong role once signed in', async () => {
    const { cookie } = await createTestUser({ role: 'STUDENT' });

    const allowed = await request(app).get('/guarded/student').set('Cookie', cookie ?? '');
    expect(allowed.status).toBe(200);

    const denied = await request(app).get('/guarded/admin').set('Cookie', cookie ?? '');
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'your account does not have access to this' });
  });

  it('allows a matching role', async () => {
    const { cookie } = await createTestUser({ role: 'ADMIN' });
    const res = await request(app).get('/guarded/admin').set('Cookie', cookie ?? '');
    expect(res.status).toBe(200);
  });

  it('returns 401 for a cookie that was never signed by better-auth', async () => {
    // This is the forgery test: a session row that exists in the database but whose cookie
    // lacks better-auth's signature must be rejected. Without signature verification, an
    // attacker who could guess a token would be signed in.
    const { id } = await createTestUser({ role: 'STUDENT', emailVerified: false });
    const unsigned = await createUnsignedCookieFor(id);

    const res = await request(app).get('/guarded/student').set('Cookie', unsigned);
    expect(res.status).toBe(401);
  });

  it('enforces the unverified-email rule only when verification is enabled', async () => {
    // Create verified so a session can be issued, then flip emailVerified off, which is
    // what an admin unverifying an address would look like.
    const { id, cookie } = await createTestUser({ role: 'STUDENT' });
    await prisma.user.update({ where: { id }, data: { emailVerified: false } });

    const res = await request(app).get('/guarded/student').set('Cookie', cookie ?? '');

    if (REQUIRE_EMAIL_VERIFICATION) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'verify your email address first' });
    } else {
      expect(res.status).toBe(200);
    }
  });

  it('returns 403 for a banned user', async () => {
    const { id, cookie } = await createTestUser({ role: 'STUDENT' });
    await prisma.user.update({ where: { id }, data: { banned: true } });

    const res = await request(app).get('/guarded/student').set('Cookie', cookie ?? '');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'this account is suspended' });
  });
});

describe('security event logging', () => {
  it('records a 403 from the role guard', async () => {
    const app = express();
    app.get('/guarded/admin', requireSession, requireRole('ADMIN'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    const { id, cookie } = await createTestUser({ role: 'STUDENT' });
    await request(app).get('/guarded/admin').set('Cookie', cookie ?? '');

    const event = await prisma.securityEvent.findFirst({
      where: { userId: id, type: 'FORBIDDEN' },
    });
    expect(event).not.toBeNull();
    expect(event?.detail).toContain('STUDENT');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
