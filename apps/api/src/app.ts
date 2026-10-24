/**
 * iskole API application factory.
 *
 * Middleware order is a security control, do not reorder casually:
 *   1. security headers (helmet)
 *   2. global rate limit
 *   3. better-auth handler at /api/auth/* (BEFORE body parsing, it reads the stream itself)
 *   4. body parsing, size-capped
 *   5. CSRF Origin check on state-changing methods
 *   6. routers (deny by default: every route wires requireSession/requireRole itself)
 *   7. terminal error handler
 */
import express from 'express';
import { env } from './lib/env';
import { csrfOriginCheck } from './middleware/csrf';
import { errorHandler } from './middleware/error-handler';
import { globalLimiter } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import { applicationsRouter } from './routes/applications';
import { apsRouter } from './routes/aps';
import { authRouter } from './routes/auth';
import { calendarRouter } from './routes/calendar';
import { clinicRouter } from './routes/clinic';
import { communityRouter } from './routes/community';
import { companiesRouter } from './routes/companies';
import { coursesRouter } from './routes/courses';
import { dashboardRouter } from './routes/dashboard';
import { expensesRouter } from './routes/expenses';
import { fundingRouter } from './routes/funding';
import { healthRouter } from './routes/health';
import { demoRouter } from './routes/demo';
import { marksRouter } from './routes/marks';
import { matchRouter } from './routes/match';
import { moneyRouter } from './routes/money';
import { notificationsRouter } from './routes/notifications';
import { offersRouter } from './routes/offers';
import { privacyRouter } from './routes/privacy';
import { profileRouter } from './routes/profile';
import { studyPlansRouter } from './routes/study-plans';
import { blocksRouter } from './routes/blocks';
import { conversationsRouter } from './routes/conversations';
import moderationRouter from './routes/moderation';
import { usersRouter } from './routes/users';
import { cvRouter } from './routes/cv';

export function createApp() {
  const app = express();

  // Behind the Next.js rewrite (or one load balancer) the socket address is always the
  // proxy, so without this every learner shares one rate-limit bucket. The hop count is
  // configured, not blindly trusted: see TRUST_PROXY_HOPS in lib/env.ts.
  if (env.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(globalLimiter);

  // better-auth owns /api/auth/*. Mounted above express.json() on purpose: see routes/auth.ts.
  app.use('/api', authRouter);

  app.use(express.json({ limit: '100kb' }));
  app.use(csrfOriginCheck);

  app.use('/api', healthRouter);
  app.use('/api', demoRouter);
  app.use('/api', profileRouter);
  app.use('/api', marksRouter);
  app.use('/api', apsRouter);
  app.use('/api', coursesRouter);
  app.use('/api', fundingRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', applicationsRouter);
  app.use('/api', studyPlansRouter);
  app.use('/api', calendarRouter);
  app.use('/api', expensesRouter);
  app.use('/api', moneyRouter);
  app.use('/api', clinicRouter);
  app.use('/api', privacyRouter);
  app.use('/api', notificationsRouter);
  app.use('/api', communityRouter);
  app.use('/api', companiesRouter);
  app.use('/api', matchRouter);
  app.use('/api', blocksRouter);
  app.use('/api', conversationsRouter);
  app.use('/api', moderationRouter);
  app.use('/api', usersRouter);
  app.use('/api', cvRouter);

  app.use(errorHandler);
  return app;
}
