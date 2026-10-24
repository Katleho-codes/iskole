/**
 * Security-event log for detecting attacks and misuse (OWASP: Logging Cheat Sheet).
 * Separate from AuditLog, which records ordinary data changes.
 *
 * Rules:
 * - Record ids and event types only. Never passwords, tokens, ID numbers, emails
 *   or message bodies.
 * - Writing a security event must never break the request it describes, so failures
 *   are swallowed and logged at error level.
 */
import { prisma } from './prisma';
import { logger } from './logger';

export type SecurityEventType =
  | 'AUTH_DUPLICATE_SIGNUP'
  | 'EMAIL_VERIFIED'
  | 'PASSWORD_RESET'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'CSRF_BLOCKED'
  | 'IDOR_ATTEMPT'
  | 'ACCOUNT_DELETED'
  | 'TALENT_VISIBILITY_CHANGED'
  | 'MODERATOR_ACTION'
  | 'GUARDIAN_CONSENT_RECORDED'
  | 'CONSENT_UPDATED'
  | 'DOCUMENT_ACCESS_DENIED';

export type SecurityEventInput = {
  type: SecurityEventType;
  /** The user the event is about, when known. */
  userId?: string;
  /** Route or resource, for example "POST /api/applications". */
  route?: string;
  /** Short machine-readable detail. No personal content. */
  detail?: string;
  /** Client IP, truncated. Useful for rate-limit and brute-force investigation. */
  ip?: string;
};

export async function recordSecurityEvent(event: SecurityEventInput): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        type: event.type,
        userId: event.userId ?? null,
        route: event.route ?? null,
        detail: event.detail ?? null,
        ip: event.ip ?? null,
      },
    });
  } catch (error) {
    logger.error(
      { type: event.type, userId: event.userId, err: error instanceof Error ? error.message : 'unknown' },
      'failed to record security event',
    );
  }
}
