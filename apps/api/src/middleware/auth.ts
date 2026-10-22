/**
 * Session and role guards. Every protected route wires these itself: deny by default.
 *
 * Docs: https://better-auth.com/docs/concepts/session-management#get-session
 *
 * Usage:
 *   router.post('/', requireSession, requireRole('STUDENT'), handler)
 *
 * Order matters: requireSession first (401), then requireRole (403). requireRole also
 * accepts a session on its own so a route can use it without requireSession.
 *
 * Do not read the role from the request body, headers or query. It comes from the
 * session row, which only better-auth writes. The client can never set its own role.
 */
import type { NextFunction, Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, REQUIRE_EMAIL_VERIFICATION, type AuthSession, type AuthUser } from '../lib/auth';
import { forbidden, unauthorized } from '../lib/http-error';
import { recordSecurityEvent } from '../lib/security-events';
import { clientIp } from '../lib/request-context';

/** Roles understood by iskole. Mirrors packages/shared constants; kept literal here so the API does not import client bundles. */
export const ROLES = ['STUDENT', 'COMPANY', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present only after requireSession or requireRole has resolved the session. */
      session?: AuthSession['session'];
      /** Present only alongside request.session. */
      authUser?: AuthUser;
    }
  }
}

/**
 * Resolve the session from the request cookies. Returns null when there is no valid
 * session. Never throws for an unknown or expired session: that is a normal 401.
 */
async function resolveSession(req: Request) {
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    // Read through to the database on guarded routes so a revoked or ended session is
    // rejected immediately, rather than up to five minutes later when the cookie cache
    // expires (docs: session-management#cookie-cache notes on revocation delay).
    query: { disableCookieCache: true },
  });
}

/**
 * Require a signed-in user. 401 when there is no session.
 *
 * Email verification is enforced at sign-in by better-auth (requireEmailVerification)
 * when REQUIRE_EMAIL_VERIFICATION is on, so a session that exists already belongs to a
 * verified address. The check is repeated here because an admin could unverify an address
 * after the session was created. While verification is temporarily off, the check is
 * skipped in both places from the same flag.
 */
export async function requireSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await resolveSession(req);
    if (!result) {
      next(unauthorized('sign in required'));
      return;
    }

    if (REQUIRE_EMAIL_VERIFICATION && !result.user.emailVerified) {
      await recordSecurityEvent({
        type: 'FORBIDDEN',
        userId: result.user.id,
        route: `${req.method} ${req.path}`,
        detail: 'unverified email on guarded route',
        ip: clientIp(req),
      });
      next(forbidden('verify your email address first'));
      return;
    }

    if (result.user.banned) {
      await recordSecurityEvent({
        type: 'FORBIDDEN',
        userId: result.user.id,
        route: `${req.method} ${req.path}`,
        detail: 'banned user on guarded route',
        ip: clientIp(req),
      });
      next(forbidden('this account is suspended'));
      return;
    }

    req.session = result.session;
    req.authUser = result.user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require one of the given roles. Resolves the session itself when requireSession did
 * not already run, so it is safe to use alone.
 *
 * Use after requireSession in the chain; the redundant lookup is skipped when
 * request.authUser is already set.
 */
export function requireRole(...allowed: Role[]) {
  return async function roleGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) {
        const result = await resolveSession(req);
        if (!result) {
          next(unauthorized('sign in required'));
          return;
        }
        req.session = result.session;
        req.authUser = result.user;
      }

      const role = (req.authUser.role ?? 'STUDENT') as Role;
      if (!allowed.includes(role)) {
        // Log every 403 with the record ids involved. This is how an IDOR or privilege
        // escalation attempt shows up in the security log.
        await recordSecurityEvent({
          type: 'FORBIDDEN',
          userId: req.authUser.id,
          route: `${req.method} ${req.path}`,
          detail: `role ${role} not permitted`,
          ip: clientIp(req),
        });
        next(forbidden('your account does not have access to this'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
