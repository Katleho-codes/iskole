/**
 * Study plans: turn "you got in" into "here is what a week looks like".
 *
 * The AI writes the blocks, but the request never contains a name, email, phone number or
 * ID number. It carries only academic context: APS, subject marks, module difficulty and
 * availability. The output is Zod-validated before it is stored, and a deterministic plan is
 * used when the model is unavailable, so the screen always has something usable.
 *
 * Approving is the learner's action: the calendar and `.ics` export are refused until a plan
 * is approved. Calendar reads are expanded from the weekly template in Africa/Johannesburg.
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  addDaysToDateKey,
  calculateAps,
  johannesburgDateKey,
  johannesburgLocalToUtc,
  minutesToTime,
  startOfWeekDateKey,
  timeToMinutes,
  LIMITS,
  StudyBlockDraftSchema,
  StudyBlockPatchSchema,
  StudyBlockSchema,
  StudyPlanDraftSchema,
  StudyPlanRequestSchema,
  type StudyAvailability,
  type StudyBlock,
  type StudyBlockDraft,
  type StudyDay,
  type StudyModule,
} from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { completeJson, AiInvalidOutputError } from '../lib/ai/json';
import { AiUnavailableError } from '../lib/ai/client';
import { assertSafeForPrompt, PromptRejectedError } from '../lib/ai/guard';
import { badRequest, notFound } from '../lib/http-error';
import { normaliseStudyBlocks } from '../lib/study-blocks';

export const studyPlansRouter = Router();

type Mark = { subject: string; mark: number };

const DEFAULT_AVAILABILITY: StudyAvailability[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
].map((day) => ({
  day: day as StudyDay,
  startTime: '17:00',
  endTime: '19:00',
}));

const SYSTEM_PROMPT =
  'You build a realistic weekly study plan for a South African learner heading to university. ' +
  'Use plain language, short tasks, and no more than two blocks per day. Respect the module ' +
  'list, difficulty and availability you are given. Spread harder modules across the week. ' +
  'Do not invent personal details. Return only the requested JSON.';

function moduleCodeFor(subject: string, index: number): string {
  const code = subject
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 14);
  return code.length >= 2 ? code : `MOD${index + 1}`;
}

function modulesFromMarks(marks: Mark[]): StudyModule[] {
  if (marks.length === 0) {
    return [{ code: 'MATH', name: 'Mathematics', difficulty: 3 }];
  }
  return marks.map((item, index) => ({
    code: moduleCodeFor(item.subject, index),
    name: item.subject,
    difficulty:
      item.mark < 40 ? 5 : item.mark < 50 ? 4 : item.mark < 60 ? 3 : item.mark < 70 ? 2 : 1,
  }));
}

function availabilityWindows(requested: StudyAvailability[]): StudyAvailability[] {
  return requested.length > 0 ? requested : DEFAULT_AVAILABILITY;
}

function timeSlots(windows: StudyAvailability[]): Array<{ day: StudyDay; startTime: string }> {
  const slots: Array<{ day: StudyDay; startTime: string }> = [];
  for (const window of windows) {
    const start = timeToMinutes(window.startTime);
    const end = timeToMinutes(window.endTime);
    // One-hour steps with a 45-minute minimum block. This is a simple, readable schedule,
    // not a constraint solver; the learner reviews and edits before approving.
    for (let minute = start; minute + 45 <= end; minute += 60) {
      slots.push({ day: window.day, startTime: minutesToTime(minute) });
    }
  }
  return slots;
}

/** Deterministic plan used when the AI is not configured or returns something invalid. */
function fallbackBlocks(modules: StudyModule[], availability: StudyAvailability[]): StudyBlock[] {
  const focus = [...modules]
    .sort((a, b) => b.difficulty - a.difficulty || a.code.localeCompare(b.code))
    .slice(0, 6);
  const slots = timeSlots(availabilityWindows(availability));
  const safeSlots =
    slots.length > 0
      ? slots
      : DEFAULT_AVAILABILITY.map((window) => ({ day: window.day, startTime: window.startTime }));

  return focus.map((module, index) => {
    const slot = safeSlots[index % safeSlots.length]!;
    const durationMinutes = Math.min(90, 45 + module.difficulty * 10);
    return StudyBlockSchema.parse({
      id: randomUUID(),
      day: slot.day,
      task: `Review ${module.name ?? module.code}: work through one past-paper question`,
      startTime: slot.startTime,
      durationMinutes,
      kind: 'PRACTICE',
      moduleCode: module.code,
      reason:
        module.difficulty >= 4
          ? 'This module needs the most practice, so it gets an early slot.'
          : 'A steady review block keeps every module in rotation.',
      completedDates: [],
      skippedDates: [],
      status: 'PLANNED',
    });
  });
}

function materialiseDraft(draft: StudyBlockDraft[]): StudyBlock[] {
  return draft.flatMap((block) => {
    const parsed = StudyBlockSchema.safeParse({
      id: randomUUID(),
      day: block.day,
      task: block.task,
      startTime: block.startTime ?? '17:00',
      durationMinutes: block.durationMinutes ?? 60,
      kind: block.kind ?? 'STUDY',
      moduleCode: block.moduleCode,
      notes: block.notes,
      reason: block.reason,
      completedDates: [],
      skippedDates: [],
      status: 'PLANNED',
    });
    return parsed.success ? [parsed.data] : [];
  });
}

async function generatePlan(
  userId: string,
  request: { modules: StudyModule[]; availability: StudyAvailability[] },
): Promise<StudyBlock[]> {
  const [marks, preferences] = await Promise.all([
    prisma.subjectMark.findMany({ where: { userId } }),
    prisma.preference.findUnique({ where: { userId } }),
  ]);

  const modules = request.modules.length > 0 ? request.modules : modulesFromMarks(marks);
  const availability = availabilityWindows(request.availability);

  if (marks.length === 0 && request.modules.length === 0) {
    return fallbackBlocks(modules, availability);
  }

  const aps = calculateAps({
    marks: marks.map((mark) => ({
      subject: mark.subject,
      mark: mark.mark,
      isHomeLanguage: mark.isHomeLanguage,
    })),
  });

  try {
    const prompt = assertSafeForPrompt(
      [
        `APS: ${aps.score} of ${aps.maxScore}`,
        marks.length > 0
          ? `Subjects and marks: ${marks.map((mark) => `${mark.subject} ${mark.mark}%`).join(', ')}`
          : 'Subject marks: not captured',
        `Fields of interest: ${preferences?.fields?.join(', ') || 'not set'}`,
        `Study mode: ${preferences?.studyMode ?? 'not set'}`,
        `Modules: ${modules
          .map(
            (module) =>
              `${module.code} (${module.name ?? 'module'}), difficulty ${module.difficulty}/5${
                module.examDate ? `, exam ${module.examDate}` : ''
              }`,
          )
          .join('; ')}`,
        `Available: ${availability
          .map((window) => `${window.day} ${window.startTime}-${window.endTime}`)
          .join(', ')}`,
      ].join('\n'),
      LIMITS.maxAiInputChars,
    );

    const result = await completeJson({
      system: SYSTEM_PROMPT,
      user:
        `${prompt}\n\nWrite one week of study blocks. Focus on the weakest modules but keep ` +
        'every module in rotation. Use only the availability windows given. Give each block a ' +
        'short one-line reason.',
      schema: StudyPlanDraftSchema,
      schemaName: 'study_plan',
      maxTokens: 1000,
      temperature: 0.4,
    });

    const materialised = materialiseDraft(result.data.blocks);
    return materialised.length > 0 ? materialised : fallbackBlocks(modules, availability);
  } catch (error) {
    // Same contract as matching: any AI-side failure, including a guard rejection, returns
    // the deterministic plan instead of an error screen.
    if (error instanceof AiUnavailableError) return fallbackBlocks(modules, availability);
    if (error instanceof AiInvalidOutputError) return fallbackBlocks(modules, availability);
    if (error instanceof PromptRejectedError) return fallbackBlocks(modules, availability);
    throw error;
  }
}

function serialisePlan(plan: {
  id: string;
  title: string;
  approved: boolean;
  blocks: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: plan.id,
    title: plan.title,
    approved: plan.approved,
    blocks: normaliseStudyBlocks(plan.id, plan.blocks),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

studyPlansRouter.get('/study-plans', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const plans = await prisma.studyPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ studyPlans: plans.map(serialisePlan) });
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
      const request = StudyPlanRequestSchema.parse(req.body ?? {});
      const blocks = await generatePlan(userId, request);

      const saved = await prisma.studyPlan.create({
        data: {
          userId,
          title: 'Your weekly study plan',
          blocks,
        },
      });

      res.status(201).json({ studyPlan: serialisePlan(saved) });
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

      const blocks = normaliseStudyBlocks(plan.id, plan.blocks);
      if (blocks.length === 0) {
        return next(badRequest('add at least one block before approving this plan'));
      }

      const approved = await prisma.studyPlan.update({
        where: { id: plan.id },
        data: { approved: true, blocks },
      });

      res.json({ studyPlan: serialisePlan(approved) });
    } catch (error) {
      next(error);
    }
  },
);

studyPlansRouter.patch(
  '/study-plans/:id/blocks/:blockId',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const patch = StudyBlockPatchSchema.parse(req.body ?? {});
      const plan = await prisma.studyPlan.findFirst({
        where: { id: String(req.params.id), userId },
      });

      if (!plan) return next(notFound('study plan not found'));

      const blocks = normaliseStudyBlocks(plan.id, plan.blocks);
      const index = blocks.findIndex((block) => block.id === String(req.params.blockId));
      if (index === -1) return next(notFound('study block not found'));

      const current = blocks[index]!;
      const nextBlock: StudyBlock = { ...current };

      if (patch.day !== undefined) nextBlock.day = patch.day;
      if (patch.task !== undefined) nextBlock.task = patch.task;
      if (patch.startTime !== undefined) nextBlock.startTime = patch.startTime;
      if (patch.durationMinutes !== undefined) nextBlock.durationMinutes = patch.durationMinutes;
      if (patch.kind !== undefined) nextBlock.kind = patch.kind;
      if (patch.moduleCode !== undefined) {
        if (patch.moduleCode === null) delete nextBlock.moduleCode;
        else nextBlock.moduleCode = patch.moduleCode;
      }
      if (patch.notes !== undefined) {
        if (patch.notes === null) delete nextBlock.notes;
        else nextBlock.notes = patch.notes;
      }
      if (patch.reason !== undefined) {
        if (patch.reason === null) delete nextBlock.reason;
        else nextBlock.reason = patch.reason;
      }

      if (patch.status !== undefined && patch.date !== undefined) {
        const completed = new Set(current.completedDates);
        const skipped = new Set(current.skippedDates);

        if (patch.status === 'DONE') {
          completed.add(patch.date);
          skipped.delete(patch.date);
        } else if (patch.status === 'SKIPPED') {
          skipped.add(patch.date);
          completed.delete(patch.date);
        } else {
          completed.delete(patch.date);
          skipped.delete(patch.date);
        }

        nextBlock.completedDates = [...completed].sort();
        nextBlock.skippedDates = [...skipped].sort();
        nextBlock.status = patch.status;
      }

      const parsed = StudyBlockSchema.safeParse(nextBlock);
      if (!parsed.success) {
        return next(badRequest('that block change is not valid'));
      }

      blocks[index] = parsed.data;
      const saved = await prisma.studyPlan.update({
        where: { id: plan.id },
        data: { blocks },
      });

      res.json({ studyPlan: serialisePlan(saved), block: parsed.data });
    } catch (error) {
      next(error);
    }
  },
);

studyPlansRouter.post(
  '/study-plans/:id/blocks',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const draft = StudyBlockDraftSchema.parse(req.body ?? {});
      const plan = await prisma.studyPlan.findFirst({
        where: { id: String(req.params.id), userId },
      });

      if (!plan) return next(notFound('study plan not found'));

      const blocks = normaliseStudyBlocks(plan.id, plan.blocks);
      if (blocks.length >= 20) {
        return next(badRequest('a plan can hold at most 20 blocks'));
      }

      const block = StudyBlockSchema.parse({
        id: randomUUID(),
        day: draft.day,
        task: draft.task,
        startTime: draft.startTime ?? '17:00',
        durationMinutes: draft.durationMinutes ?? 60,
        kind: draft.kind ?? 'STUDY',
        moduleCode: draft.moduleCode,
        notes: draft.notes,
        reason: draft.reason,
        completedDates: [],
        skippedDates: [],
        status: 'PLANNED',
      });

      const saved = await prisma.studyPlan.update({
        where: { id: plan.id },
        data: { blocks: [...blocks, block] },
      });

      res.status(201).json({ studyPlan: serialisePlan(saved), block });
    } catch (error) {
      next(error);
    }
  },
);

studyPlansRouter.delete(
  '/study-plans/:id/blocks/:blockId',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const plan = await prisma.studyPlan.findFirst({
        where: { id: String(req.params.id), userId },
      });

      if (!plan) return next(notFound('study plan not found'));

      const blocks = normaliseStudyBlocks(plan.id, plan.blocks);
      const nextBlocks = blocks.filter((block) => block.id !== String(req.params.blockId));
      if (nextBlocks.length === blocks.length) return next(notFound('study block not found'));
      if (nextBlocks.length === 0) {
        return next(badRequest('a plan needs at least one block'));
      }

      await prisma.studyPlan.update({
        where: { id: plan.id },
        data: { blocks: nextBlocks },
      });

      res.status(204).end();
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

      const blocks = normaliseStudyBlocks(plan.id, plan.blocks);
      if (blocks.length === 0) {
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
      const todayKey = johannesburgDateKey(new Date());
      const weekStart = startOfWeekDateKey(todayKey);

      for (const block of blocks) {
        const dayOffset = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].indexOf(
          block.day,
        );
        const dateKey = addDaysToDateKey(weekStart, dayOffset);
        const start = johannesburgLocalToUtc(dateKey, block.startTime);
        const end = new Date(start.getTime() + block.durationMinutes * 60_000);

        lines.push(
          'BEGIN:VEVENT',
          foldLine(`UID:${plan.id}-${block.id}@iskole`),
          `DTSTAMP:${stamp}`,
          `DTSTART:${formatUtc(start)}`,
          `DTEND:${formatUtc(end)}`,
          'RRULE:FREQ=WEEKLY;COUNT=12',
          foldLine(`SUMMARY:${escapeIcs(block.task)}`),
          foldLine(
            `DESCRIPTION:${escapeIcs(
              `${block.moduleCode ? `${block.moduleCode}: ` : ''}${block.kind.toLowerCase().replaceAll('_', ' ')} block from your iskole plan.`,
            )}`,
          ),
          'END:VEVENT',
        );
      }

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
