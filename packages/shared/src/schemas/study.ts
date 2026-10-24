import { z } from 'zod';

/**
 * Study plan and calendar contracts.
 *
 * A plan is still stored as JSON on `StudyPlan.blocks`, because a weekly plan is a small
 * document and does not need a table per block. The important change is that every block now
 * has a stable id and per-date completion, so the calendar can address one occurrence without
 * rewriting the whole week.
 *
 * Times are wall-clock times in Africa/Johannesburg. South Africa has no daylight saving, so
 * the conversion to UTC is a fixed +02:00. Keeping that fact in one place stops a server in
 * UTC and a browser in another zone from disagreeing about what "17:00" means.
 */
export const STUDY_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type StudyDay = (typeof STUDY_DAYS)[number];

export const STUDY_BLOCK_KINDS = ['STUDY', 'REVISION', 'PRACTICE', 'EXAM_PREP'] as const;
export type StudyBlockKind = (typeof STUDY_BLOCK_KINDS)[number];

export const STUDY_BLOCK_STATUSES = ['PLANNED', 'DONE', 'SKIPPED'] as const;
export type StudyBlockStatus = (typeof STUDY_BLOCK_STATUSES)[number];

export const JOHANNESBURG_TIME_ZONE = 'Africa/Johannesburg';
export const JOHANNESBURG_OFFSET_MINUTES = 2 * 60;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** True only for real calendar dates, so 2026-02-30 is rejected. */
export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export const StudyDateKeySchema = z
  .string()
  .regex(DATE_KEY_PATTERN, 'date must be YYYY-MM-DD')
  .refine(isValidDateKey, 'date must be a real calendar date');

export const StudyTimeSchema = z
  .string()
  .regex(TIME_PATTERN, 'time must be HH:MM in 24-hour format');

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}

export function minutesToTime(minutes: number): string {
  const normalised = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(normalised / 60))}:${pad(normalised % 60)}`;
}

/**
 * Convert a Johannesburg wall-clock date and time to the matching UTC instant.
 * 2026-10-23 17:00 SAST becomes 2026-10-23T15:00:00.000Z.
 */
export function johannesburgLocalToUtc(dateKey: string, time: string): Date {
  if (!isValidDateKey(dateKey) || !TIME_PATTERN.test(time)) {
    throw new Error('invalid Johannesburg date or time');
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(
    Date.UTC(year!, month! - 1, day!, hours!, minutes! - JOHANNESBURG_OFFSET_MINUTES),
  );
}

/** Read a UTC instant as a Johannesburg calendar date key. */
export function johannesburgDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JOHANNESBURG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Read a UTC instant as Johannesburg wall-clock time, returned as minutes after midnight. */
export function johannesburgMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JOHANNESBURG_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '0';
  return Number(get('hour')) * 60 + Number(get('minute'));
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Monday-first weekday name for a date key. */
export function studyDayForDateKey(dateKey: string): StudyDay {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return STUDY_DAYS[(day + 6) % 7]!;
}

/** Monday of the week containing `dateKey`. */
export function startOfWeekDateKey(dateKey: string): string {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return addDaysToDateKey(dateKey, -((day + 6) % 7));
}

export const StudyBlockSchema = z
  .object({
    id: z.string().min(1).max(80),
    day: z.enum(STUDY_DAYS),
    task: z.string().trim().min(1).max(160),
    startTime: StudyTimeSchema,
    durationMinutes: z.number().int().min(15).max(240),
    kind: z.enum(STUDY_BLOCK_KINDS).default('STUDY'),
    moduleCode: z.string().trim().max(24).optional(),
    notes: z.string().trim().max(280).optional(),
    reason: z.string().trim().max(180).optional(),
    /** Per-occurrence completion, so marking one Tuesday done does not mark every Tuesday. */
    completedDates: z.array(StudyDateKeySchema).max(104).default([]),
    skippedDates: z.array(StudyDateKeySchema).max(104).default([]),
    /** Last explicit state, used for the plan review list. Calendar status comes from dates. */
    status: z.enum(STUDY_BLOCK_STATUSES).default('PLANNED'),
  })
  .strict();

export type StudyBlock = z.infer<typeof StudyBlockSchema>;

/** The shape the model returns. IDs, defaults and status are assigned by the server. */
export const StudyBlockDraftSchema = z
  .object({
    day: z.enum(STUDY_DAYS),
    task: z.string().trim().min(1).max(160),
    startTime: StudyTimeSchema.optional(),
    durationMinutes: z.number().int().min(15).max(240).optional(),
    kind: z.enum(STUDY_BLOCK_KINDS).optional(),
    moduleCode: z.string().trim().max(24).optional(),
    notes: z.string().trim().max(280).optional(),
    reason: z.string().trim().max(180).optional(),
  })
  .strict();

export type StudyBlockDraft = z.infer<typeof StudyBlockDraftSchema>;

export const StudyPlanDraftSchema = z
  .object({
    blocks: z.array(StudyBlockDraftSchema).min(1).max(20),
  })
  .strict();

export type StudyPlanDraft = z.infer<typeof StudyPlanDraftSchema>;

export const StudyModuleSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(24)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, 'module code may contain letters, numbers, spaces, _ or -'),
    name: z.string().trim().max(80).optional(),
    difficulty: z.number().int().min(1).max(5).default(3),
    examDate: StudyDateKeySchema.optional(),
  })
  .strict();

export type StudyModule = z.infer<typeof StudyModuleSchema>;

export const StudyAvailabilitySchema = z
  .object({
    day: z.enum(STUDY_DAYS),
    startTime: StudyTimeSchema,
    endTime: StudyTimeSchema,
  })
  .strict()
  .refine((window) => timeToMinutes(window.endTime) > timeToMinutes(window.startTime), {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

export type StudyAvailability = z.infer<typeof StudyAvailabilitySchema>;

/**
 * Optional guided-creation input. An empty object still works, which keeps the original
 * "build a plan from my marks" action and the API tests backwards compatible.
 */
export const StudyPlanRequestSchema = z
  .object({
    modules: z.array(StudyModuleSchema).max(8).default([]),
    availability: z.array(StudyAvailabilitySchema).max(14).default([]),
  })
  .strict();

export type StudyPlanRequest = z.infer<typeof StudyPlanRequestSchema>;

/**
 * Edit, move, mark done or skip. Status changes are per date; a status without a date would
 * otherwise silently change every occurrence of a weekly block.
 */
export const StudyBlockPatchSchema = z
  .object({
    day: z.enum(STUDY_DAYS).optional(),
    task: z.string().trim().min(1).max(160).optional(),
    startTime: StudyTimeSchema.optional(),
    durationMinutes: z.number().int().min(15).max(240).optional(),
    kind: z.enum(STUDY_BLOCK_KINDS).optional(),
    moduleCode: z.string().trim().max(24).nullable().optional(),
    notes: z.string().trim().max(280).nullable().optional(),
    reason: z.string().trim().max(180).nullable().optional(),
    status: z.enum(STUDY_BLOCK_STATUSES).optional(),
    date: StudyDateKeySchema.optional(),
  })
  .strict()
  .refine(
    (patch) =>
      patch.day !== undefined ||
      patch.task !== undefined ||
      patch.startTime !== undefined ||
      patch.durationMinutes !== undefined ||
      patch.kind !== undefined ||
      patch.moduleCode !== undefined ||
      patch.notes !== undefined ||
      patch.reason !== undefined ||
      patch.status !== undefined,
    { message: 'nothing to update' },
  )
  .refine((patch) => patch.status === undefined || patch.date !== undefined, {
    message: 'a status change needs a date',
    path: ['date'],
  });

export type StudyBlockPatch = z.infer<typeof StudyBlockPatchSchema>;

/** `from` and `to` are ISO instants. The route rejects windows longer than two months. */
export const CalendarQuerySchema = z
  .object({
    from: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid from date'),
    to: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid to date'),
  })
  .superRefine((range, ctx) => {
    const from = new Date(range.from);
    const to = new Date(range.to);
    if (to <= from) {
      ctx.addIssue({ code: 'custom', message: 'to must be after from', path: ['to'] });
      return;
    }
    if (to.getTime() - from.getTime() > 62 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: 'custom', message: 'calendar window is too large', path: ['to'] });
    }
  });

export const CALENDAR_EVENT_KINDS = ['STUDY', 'FUNDING', 'CLINIC'] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  status: StudyBlockStatus | 'OPEN';
  moduleCode?: string | null;
  notes?: string | null;
  href?: string | null;
  planId?: string;
  blockId?: string;
};
