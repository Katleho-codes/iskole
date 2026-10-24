/**
 * Merge approved study blocks into calendar occurrences for a window.
 *
 * A weekly plan stores a template, not one row per week. This expands the template for each
 * matching day in the requested window, in Johannesburg time, and returns calendar events
 * sorted for direct rendering. It is a read model: nothing is written.
 */
import {
  addDaysToDateKey,
  johannesburgDateKey,
  johannesburgLocalToUtc,
  studyDayForDateKey,
  type CalendarEvent,
} from '@iskole/shared';
import { normaliseStudyBlocks, statusForDate } from './study-blocks';

type PlanWithBlocks = { id: string; blocks: unknown };

export function makeStudyEvents(
  plans: PlanWithBlocks[],
  from: Date,
  to: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const firstKey = johannesburgDateKey(from);
  const lastKey = johannesburgDateKey(new Date(to.getTime() - 1));

  let dateKey = firstKey;
  let guard = 0;

  while (dateKey <= lastKey && guard < 70) {
    const day = studyDayForDateKey(dateKey);

    for (const plan of plans) {
      for (const block of normaliseStudyBlocks(plan.id, plan.blocks)) {
        if (block.day !== day) continue;

        const start = johannesburgLocalToUtc(dateKey, block.startTime);
        if (start < from || start >= to) continue;

        const end = new Date(start.getTime() + block.durationMinutes * 60_000);
        events.push({
          id: `${plan.id}:${block.id}:${dateKey}`,
          kind: 'STUDY',
          title: block.task,
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false,
          status: statusForDate(block, dateKey),
          moduleCode: block.moduleCode ?? null,
          notes: block.notes ?? block.reason ?? null,
          planId: plan.id,
          blockId: block.id,
        });
      }
    }

    dateKey = addDaysToDateKey(dateKey, 1);
    guard += 1;
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}

export function calendarStats(events: CalendarEvent[]) {
  const study = events.filter((event) => event.kind === 'STUDY');
  const done = study.filter((event) => event.status === 'DONE');
  const skipped = study.filter((event) => event.status === 'SKIPPED');
  const planned = study.length - done.length - skipped.length;
  const considered = done.length + planned;
  const minutesDone = done.reduce((total, event) => {
    return total + Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000);
  }, 0);

  return {
    blocks: study.length,
    done: done.length,
    skipped: skipped.length,
    planned,
    minutesDone,
    // Skipped blocks are deliberately not counted as a failure; they are a conscious choice.
    consistency: considered === 0 ? 0 : Math.round((done.length / considered) * 100),
  };
}
