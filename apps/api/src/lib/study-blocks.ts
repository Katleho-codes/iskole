/**
 * Normalisation helpers for the JSON `StudyPlan.blocks` column.
 *
 * Plans created before M4 have no id, status or per-date completion. Rather than a data
 * migration that rewrites learner-owned JSON in place, every read normalises a copy and gives
 * legacy blocks a deterministic id. The next write persists the new shape.
 */
import {
  STUDY_BLOCK_KINDS,
  STUDY_BLOCK_STATUSES,
  StudyBlockSchema,
  isValidDateKey,
  type StudyBlock,
  type StudyBlockKind,
  type StudyBlockStatus,
} from '@iskole/shared';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, max);
}

function dateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === 'string' && isValidDateKey(item)),
    ),
  ].slice(0, 104);
}

export function normaliseStudyBlocks(planId: string, raw: unknown): StudyBlock[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const blocks: StudyBlock[] = [];

  raw.forEach((item, index) => {
    const value = record(item);
    if (!value) return;

    const task = text(value.task, 160);
    if (!task) return;

    const requestedId = text(value.id, 80);
    let id = requestedId ?? `legacy-${planId}-${index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);

    const day = typeof value.day === 'string' ? value.day.toUpperCase() : '';
    const startTime =
      typeof value.startTime === 'string' && TIME_PATTERN.test(value.startTime)
        ? value.startTime
        : '17:00';
    const duration = Number(value.durationMinutes);
    const durationMinutes =
      Number.isInteger(duration) && duration >= 15 && duration <= 240 ? duration : 60;
    const kind =
      typeof value.kind === 'string' &&
      (STUDY_BLOCK_KINDS as readonly string[]).includes(value.kind)
        ? (value.kind as StudyBlockKind)
        : 'STUDY';
    const status =
      typeof value.status === 'string' &&
      (STUDY_BLOCK_STATUSES as readonly string[]).includes(value.status)
        ? (value.status as StudyBlockStatus)
        : 'PLANNED';

    const candidate = {
      id,
      day,
      task,
      startTime,
      durationMinutes,
      kind,
      moduleCode: text(value.moduleCode, 24),
      notes: text(value.notes, 280),
      reason: text(value.reason, 180),
      completedDates: dateList(value.completedDates),
      skippedDates: dateList(value.skippedDates),
      status,
    };

    const parsed = StudyBlockSchema.safeParse(candidate);
    if (parsed.success) blocks.push(parsed.data);
  });

  return blocks;
}

export function statusForDate(block: StudyBlock, dateKey: string): StudyBlockStatus {
  if (block.completedDates.includes(dateKey)) return 'DONE';
  if (block.skippedDates.includes(dateKey)) return 'SKIPPED';
  return 'PLANNED';
}
