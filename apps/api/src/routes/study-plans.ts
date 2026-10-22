/**
 * Study plans: turn "you got in" into "here is what a week looks like".
 *
 * The AI writes the blocks, but the request never contains a name, email, phone number or
 * ID number. It carries only academic context: APS, subject marks and chosen fields. The
 * output is Zod-validated before it is stored, and a deterministic plan is used when the
 * model is unavailable, so the screen always has something usable.
 *
 * Approving is the learner's action: calendar export is refused until a plan is approved.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { completeJson, AiInvalidOutputError } from '../lib/ai/json';
import { AiUnavailableError } from '../lib/ai/client';
import { assertSafeForPrompt, PromptRejectedError } from '../lib/ai/guard';
import { badRequest, notFound } from '../lib/http-error';
import { calculateAps, LIMITS } from '@iskole/shared';

export const studyPlansRouter = Router();

const DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const blockSchema = z.object({
  day: z.enum(DAYS),
  task: z.string().trim().min(1).max(160),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM')
    .optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
});

const planSchema = z.object({
  blocks: z.array(blockSchema).min(1).max(20),
});

type PlanBlock = z.infer<typeof blockSchema>;
type Plan = z.infer<typeof planSchema>;

const SYSTEM_PROMPT =
  'You build a realistic weekly study plan for a South African learner heading to university. ' +
  'Use plain language, short tasks, and no more than two blocks per day. Respect the subject ' +
  'list you are given. Do not invent personal details. Return only the requested JSON.';

/** Deterministic plan used when the AI is not configured or returns something invalid. */
function fallbackPlan(subjects: Array<{ subject: string; mark: number }>): Plan {
  const ordered = [...subjects].sort((a, b) => a.mark - b.mark).slice(0, 5);
  const focus = ordered.length > 0 ? ordered : [{ subject: 'Mathematics', mark: 50 }];
  const days: PlanBlock['day'][] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

  return {
    blocks: focus.map((item, index) => ({
      day: days[index] ?? 'FRIDAY',
      task: `Review ${item.subject}: work through one past-paper question`,
      startTime: index % 2 === 0 ? '17:00' : '18:00',
      durationMinutes: 60,
    })),
  };
}

async function generatePlan(userId: string): Promise<Plan> {
  const [marks, preferences] = await Promise.all([
    prisma.subjectMark.findMany({ where: { userId } }),
    prisma.preference.findUnique({ where: { userId } }),
  ]);

  const aps = calculateAps({
    marks: marks.map((mark) => ({
      subject: mark.subject,
      mark: mark.mark,
      isHomeLanguage: mark.isHomeLanguage,
    })),
  });

  if (marks.length === 0) {
    return fallbackPlan([]);
  }

  try {
    const prompt = assertSafeForPrompt(
      [
        `APS: ${aps.score} of ${aps.maxScore}`,
        `Subjects and marks: ${marks
          .map((mark) => `${mark.subject} ${mark.mark}%`)
          .join(', ')}`,
        `Fields of interest: ${preferences?.fields?.join(', ') || 'not set'}`,
        `Study mode: ${preferences?.studyMode ?? 'not set'}`,
      ].join('\n'),
      LIMITS.maxAiInputChars,
    );

    const result = await completeJson({
      system: SYSTEM_PROMPT,
      user: `${prompt}\n\nWrite one week of study blocks. Focus on the weakest subjects but keep every subject in rotation.`,
      schema: planSchema,
      schemaName: 'study_plan',
      maxTokens: 900,
      temperature: 0.4,
    });

    return result.data;
  } catch (error) {
    // Same contract as matching: any AI-side failure, including a guard rejection, returns
    // the deterministic plan instead of an error screen.
    if (error instanceof AiUnavailableError) return fallbackPlan(marks);
    if (error instanceof AiInvalidOutputError) return fallbackPlan(marks);
    if (error instanceof PromptRejectedError) return fallbackPlan(marks);
    throw error;
  }
}

studyPlansRouter.get('/study-plans', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const plans = await prisma.studyPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      studyPlans: plans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        approved: plan.approved,
        blocks: plan.blocks,
        createdAt: plan.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

studyPlansRouter.post(
  '/study-plans',
  requireSession,
  requireRole('STUDENT'),
  idempotent(),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const plan = await generatePlan(userId);

      const saved = await prisma.studyPlan.create({
        data: {
          userId,
          title: 'Your weekly study plan',
          blocks: plan.blocks,
        },
      });

      res.status(201).json({
        studyPlan: {
          id: saved.id,
          title: saved.title,
          approved: saved.approved,
          blocks: saved.blocks,
          createdAt: saved.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

studyPlansRouter.post(
  '/study-plans/:id/approve',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const plan = await prisma.studyPlan.findFirst({
        where: { id: String(req.params.id), userId },
      });

      if (!plan) {
        return next(notFound('study plan not found'));
      }

      const approved = await prisma.studyPlan.update({
        where: { id: plan.id },
        data: { approved: true },
      });

      res.json({
        studyPlan: {
          id: approved.id,
          title: approved.title,
          approved: approved.approved,
          blocks: approved.blocks,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Escape an ICS text value. Commas, semicolons and backslashes are field separators. */
function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold long content lines at 75 octets, as RFC 5545 requires. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let index = 75; index < line.length; index += 74) {
    parts.push(` ${line.slice(index, index + 74)}`);
  }
  return parts.join('\r\n');
}

const DAY_INDEX: Record<PlanBlock['day'], number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function nextOccurrence(day: PlanBlock['day'], startTime: string): Date {
  const [hours, minutes] = startTime.split(':').map(Number);
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  const delta = (DAY_INDEX[day] - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function formatLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

studyPlansRouter.get(
  '/study-plans/:id/calendar.ics',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const plan = await prisma.studyPlan.findFirst({
        where: { id: String(req.params.id), userId },
      });

      if (!plan) {
        return next(notFound('study plan not found'));
      }
      if (!plan.approved) {
        return next(badRequest('approve the plan before exporting it'));
      }

      // Stored as the array itself, so wrap it in the shape the schema validates.
      const parsed = planSchema.safeParse({ blocks: plan.blocks });
      if (!parsed.success) {
        return next(badRequest('this plan is not in a valid format'));
      }

      const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//iskole//Study Plan//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:iskole study plan',
      ];

      const stamp = formatUtc(new Date());

      parsed.data.blocks.forEach((block, index) => {
        const startTime = block.startTime ?? '17:00';
        const duration = block.durationMinutes ?? 60;
        const start = nextOccurrence(block.day, startTime);
        const end = new Date(start.getTime() + duration * 60 * 1000);

        lines.push(
          'BEGIN:VEVENT',
          foldLine(`UID:${plan.id}-${index}@iskole`),
          `DTSTAMP:${stamp}`,
          `DTSTART:${formatLocal(start)}`,
          `DTEND:${formatLocal(end)}`,
          'RRULE:FREQ=WEEKLY;COUNT=12',
          foldLine(`SUMMARY:${escapeIcs(`Study: ${block.task}`)}`),
          foldLine(`DESCRIPTION:${escapeIcs('Weekly study block from your iskole plan.')}`),
          'END:VEVENT',
        );
      });

      lines.push('END:VCALENDAR');

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="iskole-study-plan-${plan.id}.ics"`,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.send(`${lines.join('\r\n')}\r\n`);
    } catch (error) {
      next(error);
    }
  },
);
