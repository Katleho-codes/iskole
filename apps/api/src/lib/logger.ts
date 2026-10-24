/**
 * Structured logging with PII kept out by design (OWASP Logging Cheat Sheet).
 * Log record ids, never personal content: no names, ID numbers, emails or message bodies.
 * Auth events, 403s and rate-limit hits are written to the SecurityEvent table (M1+),
 * this logger is for operational output only.
 */
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["idempotency-key"]',
      '*.password',
      '*.idNumber',
      '*.email',
    ],
    censor: '[redacted]',
  },
});
