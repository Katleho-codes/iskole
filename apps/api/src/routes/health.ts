import { Router } from 'express';

export const healthRouter = Router();

// Liveness probe. No auth, no data, safe to expose.
// Mounted under /api so every Express route matches the Next rewrite (/api/* -> Express).
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'iskole-api' });
});
