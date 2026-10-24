/**
 * Idempotency middleware for creating and submitting POSTs (OWASP: REST Security Cheat
 * Sheet, idempotency notes).
 *
 * Why this exists: a learner on a slow South African mobile connection will tap "submit"
 * twice, or their browser will retry a request whose response was lost. Without this,
 * that is a duplicate application, a duplicate booking, or a duplicate payment attempt.
 *
 * Contract:
 *   - The client sends an `Idempotency-Key` header (any opaque string, we cap the length).
 *   - First request with a key: run the handler, store the status and body, return them.
 *   - Repeat with the same key and the same request: replay the stored response verbatim,
 *     with `Idempotent-Replay: true` so tests and clients can tell the difference.
 *   - Repeat with the same key but a different request body: 422. Reusing a key for
 *     different content is a client bug, and guessing which one the caller meant is worse
 *     than refusing.
 *   - Keys are scoped per user. The same key from two accounts is two different requests,
 *     so one learner cannot collide with, or read, another's cached response.
 *   - Records expire after 24 hours.
 *
 * Concurrency: two identical requests can arrive at once (double tap, or a retry racing a
 * slow original). The unique index on (userId, key) is the arbiter. We insert a claim row
 * before running the handler, so exactly one request wins the insert and the loser sees the
 * unique violation, waits briefly, and replays the winner's stored response. Without that,
 * both would pass a read-then-write check and two records would be created.
 *
 * Errors are never cached: a 5xx, or a request that threw, leaves the claim row deleted so
 * the caller can retry with the same key. Only successful (2xx) responses are stored.
 */
import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { badRequest, unprocessable } from '../lib/http-error';
import { logger } from '../lib/logger';

/** A key longer than this is a client mistake; capping keeps the index small. */
const MAX_KEY_CHARS = 200;

/** How long a stored response stays replayable. */
const TTL_MS = 24 * 60 * 60 * 1000;

/** How long a loser of the insert race waits for the winner's response to land. */
const RACE_WAIT_MS = 2_000;
const RACE_POLL_MS = 50;

/**
 * Hash of everything that identifies this request: method, path and body. The body is
 * serialised with sorted keys so two semantically equal objects hash the same regardless
 * of key order.
 *
 * A Buffer body (document upload) is hashed by its bytes. Serialising it as JSON would
 * expand a 5 MB file into tens of megabytes of array indexes for no benefit.
 */
function hashRequest(req: Request): string {
  const body = Buffer.isBuffer(req.body)
    ? `sha256:${createHash('sha256').update(req.body).digest('hex')}`
    : stableStringify(req.body ?? null);
  return createHash('sha256').update(`${req.method}\n${req.path}\n${body}`).digest('hex');
}

/**
 * Deterministic JSON, so { a: 1, b: 2 } and { b: 2, a: 1 } produce the same hash.
 * Arrays keep their order: [1, 2] and [2, 1] are genuinely different requests.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wrap a route handler so it is replay-safe. Mount after requireSession, so `req.authUser`
 * is guaranteed and the key is scoped to a real account.
 *
 *   router.post('/', requireSession, idempotent(), handler)
 */
export function idempotent() {
  return async function idempotencyGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const user = req.authUser;
    if (!user) {
      // Programming error: the route wired idempotent() without requireSession before it.
      next(new Error('idempotent() requires requireSession to have run first'));
      return;
    }

    const rawKey = req.get('idempotency-key');
    if (!rawKey) {
      next(badRequest('this request requires an Idempotency-Key header'));
      return;
    }
    if (rawKey.length > MAX_KEY_CHARS) {
      next(badRequest(`Idempotency-Key must be ${MAX_KEY_CHARS} characters or fewer`));
      return;
    }

    const requestHash = hashRequest(req);
    const now = new Date();

    // 1. Is this key already known? A live record replays; an expired one is replaced.
    const existing = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId: user.id, key: rawKey } },
    });

    if (existing && existing.expiresAt > now) {
      if (existing.requestHash !== requestHash) {
        next(unprocessable('this Idempotency-Key was already used with a different request'));
        return;
      }
      res.setHeader('Idempotent-Replay', 'true');
      res.status(existing.status).json(existing.responseBody);
      return;
    }

    if (existing) {
      // Expired: drop it so the claim below can reuse the key.
      await prisma.idempotencyKey.delete({ where: { id: existing.id } }).catch(() => undefined);
    }

    // 2. Claim the key before running the handler. The unique index means exactly one
    //    request wins; everyone else lands in the catch and replays the winner's result.
    const claim = { userId: user.id, key: rawKey, requestHash };
    try {
      await prisma.idempotencyKey.create({
        data: {
          ...claim,
          status: 0,
          responseBody: {},
          expiresAt: new Date(now.getTime() + TTL_MS),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        next(error);
        return;
      }
      await replayAfterRace(req, res, next, user.id, rawKey, requestHash);
      return;
    }

    // 3. We won the claim. Capture the response so it can be replayed, then run the handler.
    let settled = false;

    const cleanupClaim = async () => {
      // Only for failed requests: remove the claim so the caller can retry the same key.
      await prisma.idempotencyKey
        .delete({ where: { userId_key: { userId: user.id, key: rawKey } } })
        .catch(() => undefined);
    };

    const originalJson = res.json.bind(res);
    res.json = function captureJson(body: unknown) {
      const status = res.statusCode;
      // Store only real successes. Anything that failed is not a replay candidate.
      if (!settled && status >= 200 && status < 300) {
        settled = true;
        void prisma.idempotencyKey
          .update({
            where: { userId_key: { userId: user.id, key: rawKey } },
            data: { status, responseBody: body as never },
          })
          .catch(async (error: unknown) => {
            logger.error(
              { userId: user.id, err: error instanceof Error ? error.message : 'unknown' },
              'failed to store idempotent response',
            );
            await cleanupClaim();
          });
      } else if (!settled) {
        settled = true;
        void cleanupClaim();
      }
      return originalJson(body);
    } as Response['json'];

    res.on('finish', () => {
      if (!settled) {
        settled = true;
        if (res.statusCode < 200 || res.statusCode >= 300) void cleanupClaim();
      }
    });

    next();
  };
}

/**
 * We lost the insert race. The winner is running the handler now; poll briefly for its
 * stored response and replay it. If it does not arrive in time, tell the caller to retry
 * rather than run the handler a second time.
 */
async function replayAfterRace(
  req: Request,
  res: Response,
  next: NextFunction,
  userId: string,
  key: string,
  requestHash: string,
): Promise<void> {
  const deadline = Date.now() + RACE_WAIT_MS;

  while (Date.now() < deadline) {
    const record = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });

    if (record && record.status !== 0) {
      if (record.requestHash !== requestHash) {
        next(unprocessable('this Idempotency-Key was already used with a different request'));
        return;
      }
      res.setHeader('Idempotent-Replay', 'true');
      res.status(record.status).json(record.responseBody);
      return;
    }

    // The winner removed the claim, which means its request failed. Let this caller run
    // the handler itself rather than 409, since a retry with the same key is legitimate.
    if (!record) {
      next();
      return;
    }

    await sleep(RACE_POLL_MS);
  }

  res.status(409).json({ error: 'a request with this Idempotency-Key is still in progress' });
}