/**
 * 1:1 conversations and direct messages.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../lib/http-error';
import { isBlocked } from './blocks';

export const conversationsRouter = Router();

const CreateConversationSchema = z
  .object({
    recipientId: z.string().min(1).max(64),
  })
  .strict();

const MessageCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

conversationsRouter.get('/conversations', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ initiatorId: userId }, { recipientId: userId }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        initiator: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    res.json({
      conversations: conversations.map((c) => {
        const other = c.initiatorId === userId ? c.recipient : c.initiator;
        return {
          id: c.id,
          otherUserId: other.id,
          otherUserName: other.name,
          lastMessage: c.messages[0]
            ? { id: c.messages[0].id, body: c.messages[0].body, createdAt: c.messages[0].createdAt }
            : null,
          updatedAt: c.updatedAt,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

conversationsRouter.post('/conversations', requireSession, idempotent(), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const input = CreateConversationSchema.parse(req.body);
    if (input.recipientId === userId) {
      return res.status(400).json({ error: 'cannot message yourself' });
    }

    if (await isBlocked(userId, input.recipientId)) {
      return next(forbidden('cannot start a conversation with this user'));
    }

    // Under-18 safeguards: 1:1 messages from or to adults are not allowed for under-18 accounts.
    const [me, them] = await Promise.all([
      prisma.profile.findUnique({ where: { userId }, select: { dateOfBirth: true } }),
      prisma.profile.findUnique({ where: { userId: input.recipientId }, select: { dateOfBirth: true } }),
    ]);
    const { isAdult } = await import('@iskole/shared');
    const meAdult = me?.dateOfBirth ? isAdult(new Date(me.dateOfBirth)) : true;
    const themAdult = them?.dateOfBirth ? isAdult(new Date(them.dateOfBirth)) : true;
    if (meAdult !== themAdult) {
      return next(forbidden('age-restricted messaging'));
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { initiatorId: userId, recipientId: input.recipientId },
          { initiatorId: input.recipientId, recipientId: userId },
        ],
      },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { initiatorId: userId, recipientId: input.recipientId },
      });
    }
    res.status(201).json({ conversation: { id: conversation.id, initiatorId: conversation.initiatorId, recipientId: conversation.recipientId } });
  } catch (error) {
    next(error);
  }
});

conversationsRouter.get('/conversations/:id/messages', requireSession, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { initiator: { select: { id: true } }, recipient: { select: { id: true } } },
    });
    if (!conversation) return next(notFound('conversation not found'));
    if (conversation.initiatorId !== userId && conversation.recipientId !== userId) {
      return next(forbidden('not a participant'));
    }
    if (await isBlocked(conversation.initiatorId, conversation.recipientId)) {
      return res.json({ messages: [] });
    }

    const messages = await prisma.directMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, body: true, createdAt: true, senderId: true },
    });
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

conversationsRouter.post('/conversations/:id/messages', requireSession, idempotent(), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const input = MessageCreateSchema.parse(req.body);
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { initiator: true, recipient: true },
    });
    if (!conversation) return next(notFound('conversation not found'));
    if (conversation.initiatorId !== userId && conversation.recipientId !== userId) {
      return next(forbidden('not a participant'));
    }
    if (await isBlocked(conversation.initiatorId, conversation.recipientId)) {
      return next(forbidden('blocked'));
    }

    const [me, them] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: conversation.initiatorId }, select: { dateOfBirth: true } }),
      prisma.profile.findUnique({ where: { userId: conversation.recipientId }, select: { dateOfBirth: true } }),
    ]);
    const { isAdult } = await import('@iskole/shared');
    const iAdult = me?.dateOfBirth ? isAdult(new Date(me.dateOfBirth)) : true;
    const rAdult = them?.dateOfBirth ? isAdult(new Date(them.dateOfBirth)) : true;
    if (iAdult !== rAdult) {
      return next(forbidden('age-restricted messaging'));
    }

    const message = await prisma.directMessage.create({
      data: { conversationId: conversation.id, senderId: userId, body: input.body },
      select: { id: true, body: true, createdAt: true, senderId: true },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
});

export default conversationsRouter;
