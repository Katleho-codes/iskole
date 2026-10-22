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
import { requireSession } from '../middleware/auth';
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
  })
  .strict();

communityRouter.get('/communities', async (_req, res, next) => {
  try {
    const communities = await prisma.community.findMany({
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });

    res.json({
      communities: communities.map((community) => ({
        id: community.id,
        name: community.name,
        field: community.field,
        description: community.description,
        messageCount: community._count.messages,
        createdAt: community.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

communityRouter.post(
  '/communities',
  requireSession,
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

    // Newest first for the limit, then reversed so the client renders oldest at the top.
    const newest = await prisma.message.findMany({
      where: { communityId: query.communityId },
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

      const report = await prisma.report.create({
        data: {
          reporterId: userId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
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
