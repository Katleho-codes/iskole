/**
 * Community: peer groups, messages, and reports.
 *
 * Privacy decisions that are deliberate:
 * - Messages are visible only to signed-in learners. There is no public feed and no
 *   search-engine exposure.
 * - A message response includes the author's display name, never their email or phone.
 * - A report stores the target id and the reason, not a copy of the reported content.
 *
 * Company candidate search lives in `companies.ts`, where the approval gate sits.
 */
import { Router } from 'express';
import { z } from 'zod';
import { FIELDS_OF_STUDY } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { notFound, HttpError } from '../lib/http-error';

export const communityRouter = Router();

const CommunityCreateSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).optional(),
    field: z.enum(FIELDS_OF_STUDY).optional(),
  })
  .strict();

const MessageCreateSchema = z
  .object({
    communityId: z.string().min(1).max(64),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

const MessageQuerySchema = z.object({
  communityId: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const ReportCreateSchema = z
  .object({
    targetType: z.enum(['MESSAGE', 'USER', 'COMMUNITY']),
    targetId: z.string().min(1).max(64),
    reason: z.string().trim().min(10).max(500),
    evidence: z.array(z.string()).optional(),
  })
  .strict();

const CommunityUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(80).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    field: z.enum(FIELDS_OF_STUDY).optional().nullable(),
  })
  .strict();

communityRouter.get('/communities', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const [communities, preferences] = await Promise.all([
      prisma.community.findMany({
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: { _count: { select: { messages: true } } },
      }),
      prisma.preference.findUnique({ where: { userId }, select: { fields: true } }),
    ]);

    const userFields = new Set(preferences?.fields || []);

    res.json({
      communities: communities.map((community) => ({
        id: community.id,
        name: community.name,
        field: community.field,
        description: community.description,
        messageCount: community._count.messages,
        createdAt: community.createdAt,
        recommended: community.field ? userFields.has(community.field) : false,
      })),
    });
  } catch (error) {
    next(error);
  }
});

communityRouter.post(
  '/communities',
  requireSession,
  requireRole('ADMIN'),
  idempotent(),
  async (req, res, next) => {
    try {
      const input = CommunityCreateSchema.parse(req.body);

      const community = await prisma.community.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          field: input.field ?? null,
          createdById: req.authUser!.id,
        },
      });

      res.status(201).json({
        community: {
          id: community.id,
          name: community.name,
          field: community.field,
          description: community.description,
          messageCount: 0,
          createdAt: community.createdAt,
          recommended: false,
        },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        return next(new HttpError(409, 'a community with that name already exists'));
      }
      next(error);
    }
  },
);

communityRouter.patch(
  '/communities/:id',
  requireSession,
  requireRole('ADMIN'),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const input = CommunityUpdateSchema.parse(req.body);
      const community = await prisma.community.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.field !== undefined ? { field: input.field } : {}),
        },
      });
      res.json({
        community: {
          id: community.id,
          name: community.name,
          field: community.field,
          description: community.description,
          createdAt: community.createdAt,
        },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        return next(new HttpError(409, 'a community with that name already exists'));
      }
      next(error);
    }
  },
);

communityRouter.delete(
  '/communities/:id',
  requireSession,
  requireRole('ADMIN'),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      await prisma.community.delete({ where: { id } });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

communityRouter.get('/messages', requireSession, async (req, res, next) => {
  try {
    const query = MessageQuerySchema.parse(req.query);

    const community = await prisma.community.findUnique({
      where: { id: query.communityId },
      select: { id: true },
    });
    if (!community) {
      return next(notFound('community not found'));
    }

    // Block enforcement: if blocked by or blocking, don't show messages from blocked users? 
    // "Block is enforced in every message and conversation query" - apply to messages
    const userId = req.authUser!.id;
    const blocks = await prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: userId },
          { blockedId: userId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) blockedIds.add(b.blockedId);
      if (b.blockedId === userId) blockedIds.add(b.blockerId);
    }

    // Newest first for the limit, then reversed so the client renders oldest at the top.
    const newest = await prisma.message.findMany({
      where: { communityId: query.communityId, userId: { notIn: Array.from(blockedIds) } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });

    res.json({
      messages: newest.reverse().map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        authorName: message.user.name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

communityRouter.post(
  '/messages',
  requireSession,
  idempotent(),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const input = MessageCreateSchema.parse(req.body);

      const community = await prisma.community.findUnique({
        where: { id: input.communityId },
        select: { id: true },
      });
      if (!community) {
        return next(notFound('community not found'));
      }

      // If blocked by anyone, cannot post? Also check if this user blocked someone - maybe not directly relevant
      // Block is enforced in every message and conversation query - enforce generally
      const blocked = await prisma.userBlock.count({
        where: {
          OR: [
            { blockerId: userId },
            { blockedId: userId },
          ],
        },
      });
      // If someone has blocked this user, we still allow posting? Or block both ways - requirement says "Block is enforced"
      // Enforce: if blocked by anyone, prevent posting to avoid interaction
      const blockedByAnyone = await prisma.userBlock.findFirst({
        where: { blockedId: userId },
      });
      if (blockedByAnyone) {
        return res.status(403).json({ error: 'blocked' });
      }

      const message = await prisma.message.create({
        data: {
          communityId: input.communityId,
          userId,
          body: input.body,
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      });

      res.status(201).json({
        message: {
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          authorName: message.user.name,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

communityRouter.post(
  '/reports',
  requireSession,
  idempotent(),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const input = ReportCreateSchema.parse(req.body);

      // For MESSAGE reports, evidence must belong to reported user and be visible to reporter
      // Also handle evidence in body if passed
      let evidence = undefined;
      const body: any = req.body;
      if (Array.isArray(body.evidence)) {
        // validate evidence belong to reported user
        if (input.targetType === 'MESSAGE') {
          const messages = await prisma.message.findMany({
            where: { id: { in: body.evidence } },
            select: { id: true, userId: true },
          });
          // evidence must belong to the reported user; reported user is message author?
          const targetMsg = await prisma.message.findUnique({ where: { id: input.targetId }, select: { userId: true } });
          if (targetMsg) {
            const valid = messages.every((m) => m.userId === targetMsg.userId);
            if (!valid || messages.length !== body.evidence.length) {
              return res.status(400).json({ error: 'invalid evidence' });
            }
            evidence = body.evidence;
          }
        } else if (input.targetType === 'USER') {
          const messages = await prisma.message.findMany({
            where: { id: { in: body.evidence }, userId: input.targetId },
            select: { id: true },
          });
          if (messages.length !== body.evidence.length) {
            return res.status(400).json({ error: 'invalid evidence' });
          }
          evidence = body.evidence;
        }
      }

      const report = await prisma.report.create({
        data: {
          reporterId: userId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          evidence: evidence ?? null,
          status: 'SUBMITTED',
        },
        select: { id: true, status: true, createdAt: true },
      });

      res.status(201).json({ report });
    } catch (error) {
      next(error);
    }
  },
);


communityRouter.get('/messages/stream', requireSession, async (req, res) => {
  const communityId = String(req.query.communityId || '');
  if (!communityId) {
    return res.status(400).json({ error: 'communityId required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  let lastId: string | null = null;
  const sendUpdates = async () => {
    try {
      const userId = req.authUser!.id;
      const blocks = await prisma.userBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      });
      const blockedIds = new Set();
      for (const b of blocks) {
        if (b.blockerId === userId) blockedIds.add(b.blockedId);
        if (b.blockedId === userId) blockedIds.add(b.blockerId);
      }
      const messages = await prisma.message.findMany({
        where: { communityId, userId: { notIn: Array.from(blockedIds) as string[] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },
      });
      const latest = messages[0] && messages[0].id;
      if (latest && latest !== lastId) {
        lastId = latest;
        const data = JSON.stringify({
          messages: messages.slice().reverse().map((m) => ({
            id: m.id,
            body: m.body,
            createdAt: m.createdAt,
            authorName: m.user.name,
          })),
        });
        res.write('data: ' + data + '\n\n');
      }
    } catch (e) {}
  };
  await sendUpdates();
  const iv = setInterval(sendUpdates, 5000);
  req.on('close', () => {
    clearInterval(iv);
    res.end();
  });
});

export default communityRouter;
