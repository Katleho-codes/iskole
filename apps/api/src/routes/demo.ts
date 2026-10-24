import { Router } from 'express';
import { requireSession } from '../middleware/auth';
import { env } from '../lib/env';
import { runAllNudges } from '../lib/nudges';

export const demoRouter = Router();

/**
 * Demo-only trigger. Returns 404 when DEMO_MODE is off, so the route is invisible in a real
 * deployment instead of merely hidden in the UI.
 */
demoRouter.post('/demo/run-nudges', requireSession, async (req, res, next) => {
  try {
    if (!env.DEMO_MODE) {
      return res.status(404).json({ error: 'not found' });
    }
    await runAllNudges();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
