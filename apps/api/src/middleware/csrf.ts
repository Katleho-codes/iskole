/**
 * CSRF protection for state-changing routes (OWASP: CSRF Prevention Cheat Sheet).
 * iskole uses cookie sessions (better-auth) with SameSite=Lax, and adds Origin /
 * Sec-Fetch-Site verification on top as defence in depth. Browsers always send an
 * Origin header on cross-site POST/PUT/PATCH/DELETE, so a missing Origin means a
 * non-browser client that cannot carry the session cookie cross-site anyway.
 * Auth routes are additionally protected by better-auth's own CSRF token.
 */
import type { NextFunction, Request, Response } from 'express';
import { env } from '../lib/env';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfOriginCheck(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING.has(req.method)) {
    next();
    return;
  }

  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    res.status(403).json({ error: 'cross-origin request blocked' });
    return;
  }

  const origin = req.get('origin');
  if (origin) {
    let originHost: string | null;
    try {
      originHost = new URL(origin).origin;
    } catch {
      originHost = null;
    }
    const ownOrigin = `${req.protocol}://${req.get('host') ?? ''}`;
    if (!originHost || (originHost !== env.APP_URL && originHost !== ownOrigin)) {
      res.status(403).json({ error: 'cross-origin request blocked' });
      return;
    }
  }

  next();
}
