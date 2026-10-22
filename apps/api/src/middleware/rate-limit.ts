/**
 * Global rate limiter (OWASP: REST Security Cheat Sheet, per IP).
 * Stricter per-account limiters are layered on auth, AI and expensive routes in later
 * milestones; this is the outer guard on every request.
 */
import { rateLimit } from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too many requests, slow down and try again shortly' },
});
