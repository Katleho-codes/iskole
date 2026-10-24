/**
 * Calendar date helpers for the web app.
 *
 * Calendar days are represented as `YYYY-MM-DD` keys in Johannesburg time. Keeping the key
 * separate from the instant means a block at 17:00 stays at 17:00 when the browser is in a
 * different timezone. date-fns handles the human labels and month arithmetic; the shared
 * helpers handle the fixed +02:00 conversion.
 */
import { addMonths, format, startOfMonth } from 'date-fns';
import {
  addDaysToDateKey,
  johannesburgDateKey,
  johannesburgMinutesOfDay,
  minutesToTime,
  startOfWeekDateKey,
  type CalendarEvent,
} from '@iskole/shared';

export type CalendarView = 'day' | 'week' | 'month' | 'agenda';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 22;
export const HOUR_HEIGHT = 48;

/** Noon UTC keeps the date stable for the common SAST/browser offsets. */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function formatDateKey(key: string, pattern: string): string {
  return format(dateFromKey(key), pattern);
}

export function todayKey(): string {
  return johannesburgDateKey(new Date());
}

export function addDaysKey(key: string, days: number): string {
  return addDaysToDateKey(key, days);
}

export function addMonthsKey(key: string, months: number): string {
  const date = addMonths(startOfMonth(dateFromKey(key)), months);
  return format(date, 'yyyy-MM-dd');
}

export function weekKeys(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(startKey, index));
}

export function monthGridStartKey(anchorKey: string): string {
  return startOfWeekDateKey(`${anchorKey.slice(0, 7)}-01`);
}

export function monthGridKeys(anchorKey: string): string[] {
  const start = monthGridStartKey(anchorKey);
  return Array.from({ length: 42 }, (_, index) => addDaysToDateKey(start, index));
}

export function monthKey(anchorKey: string): string {
  return anchorKey.slice(0, 7);
}

/** Inclusive start key and exclusive end key for the API window. */
export function rangeForView(
  view: CalendarView,
  anchorKey: string,
): { startKey: string; endKey: string; label: string } {
  if (view === 'day') {
    return {
      startKey: anchorKey,
      endKey: addDaysToDateKey(anchorKey, 1),
      label: formatDateKey(anchorKey, 'EEEE d MMMM yyyy'),
    };
  }

  if (view === 'week') {
    const startKey = startOfWeekDateKey(anchorKey);
    const endKey = addDaysToDateKey(startKey, 7);
    const first = formatDateKey(startKey, 'd MMM');
    const last = formatDateKey(addDaysToDateKey(startKey, 6), 'd MMM yyyy');
    return { startKey, endKey, label: `${first} – ${last}` };
  }

  if (view === 'month') {
    const startKey = monthGridStartKey(anchorKey);
    return {
      startKey,
      endKey: addDaysToDateKey(startKey, 42),
      label: formatDateKey(`${anchorKey.slice(0, 7)}-01`, 'MMMM yyyy'),
    };
  }

  return {
    startKey: anchorKey,
    endKey: addDaysToDateKey(anchorKey, 30),
    label: `${formatDateKey(anchorKey, 'd MMM')} – ${formatDateKey(addDaysToDateKey(anchorKey, 29), 'd MMM yyyy')}`,
  };
}

export function shiftAnchor(view: CalendarView, anchorKey: string, direction: 1 | -1): string {
  if (view === 'day') return addDaysToDateKey(anchorKey, direction);
  if (view === 'week') return addDaysToDateKey(anchorKey, direction * 7);
  if (view === 'month') return addMonthsKey(anchorKey, direction);
  return addDaysToDateKey(anchorKey, direction * 30);
}

export function eventDateKey(event: CalendarEvent): string {
  return johannesburgDateKey(new Date(event.start));
}

export function eventMinutes(event: CalendarEvent): { start: number; end: number } {
  const start = johannesburgMinutesOfDay(new Date(event.start));
  const end = johannesburgMinutesOfDay(new Date(event.end));
  return { start, end: end <= start ? start + 60 : end };
}

export function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  return minutesToTime(eventMinutes(event).start);
}

export function eventDateTimeLabel(event: CalendarEvent): string {
  const key = eventDateKey(event);
  if (event.allDay) return formatDateKey(key, 'EEEE d MMMM yyyy');
  const { start, end } = eventMinutes(event);
  return `${formatDateKey(key, 'EEE d MMM')} · ${minutesToTime(start)}–${minutesToTime(end)}`;
}

export function isToday(key: string): boolean {
  return key === todayKey();
}

export function sameMonth(key: string, anchorKey: string): boolean {
  return key.slice(0, 7) === monthKey(anchorKey);
}
