/**
 * Terminal error handler (OWASP: Error Handling Cheat Sheet).
 * Clients receive a generic message and, for validation problems, safe field-level detail.
 * Stack traces and internal errors stay server-side, tagged with an id for support.
 */
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { logger } from '../lib/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'invalid request',
      issues: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Body-parser JSON syntax failure arrives as a SyntaxError with status 400.
  if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid JSON body' });
    return;
  }

  // express.raw's limit. Tell the caller the file is too large instead of a generic 500.
  if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'that file is too large' });
    return;
  }

  const errorId = randomUUID();
  logger.error({ errorId, method: req.method, path: req.path }, 'unhandled error');
  res.status(500).json({ error: 'internal error', errorId });
}
