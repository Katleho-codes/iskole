import { describe, expect, it } from 'vitest';
import {
  addDaysToDateKey,
  isValidDateKey,
  johannesburgDateKey,
  johannesburgLocalToUtc,
  johannesburgMinutesOfDay,
  minutesToTime,
  startOfWeekDateKey,
  studyDayForDateKey,
  StudyBlockPatchSchema,
  StudyBlockSchema,
  StudyPlanRequestSchema,
  timeToMinutes,
} from './study';

describe('Johannesburg time helpers', () => {
  it('converts a SAST wall-clock time to UTC with the fixed +02:00 offset', () => {
    expect(johannesburgLocalToUtc('2026-10-23', '17:00').toISOString()).toBe(
      '2026-10-23T15:00:00.000Z',
    );
  });

  it('reads a UTC instant back as the Johannesburg date and time', () => {
    const instant = new Date('2026-10-23T22:30:00.000Z');
    expect(johannesburgDateKey(instant)).toBe('2026-10-24');
    expect(johannesburgMinutesOfDay(instant)).toBe(30);
  });

  it('handles midnight and a leap day without drifting', () => {
    expect(johannesburgLocalToUtc('2028-02-29', '00:00').toISOString()).toBe(
      '2028-02-28T22:00:00.000Z',
    );
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2028-02-29')).toBe(true);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('uses a Monday-first week', () => {
    expect(startOfWeekDateKey('2026-10-23')).toBe('2026-10-19');
    expect(studyDayForDateKey('2026-10-19')).toBe('MONDAY');
    expect(studyDayForDateKey('2026-10-25')).toBe('SUNDAY');
  });

  it('converts minutes to a 24-hour time', () => {
    expect(timeToMinutes('09:15')).toBe(555);
    expect(minutesToTime(555)).toBe('09:15');
    expect(minutesToTime(24 * 60 + 5)).toBe('00:05');
  });
});

describe('StudyBlockSchema', () => {
  const block = {
    id: 'block-1',
    day: 'MONDAY',
    task: 'Practise algebra',
    startTime: '17:00',
    durationMinutes: 60,
  };

  it('fills safe defaults for a minimal block', () => {
    const parsed = StudyBlockSchema.parse(block);
    expect(parsed.kind).toBe('STUDY');
    expect(parsed.status).toBe('PLANNED');
    expect(parsed.completedDates).toEqual([]);
  });

  it('rejects a bad time, duration and unknown field', () => {
    expect(StudyBlockSchema.safeParse({ ...block, startTime: '25:00' }).success).toBe(false);
    expect(StudyBlockSchema.safeParse({ ...block, durationMinutes: 5 }).success).toBe(false);
    expect(StudyBlockSchema.safeParse({ ...block, userId: 'someone' }).success).toBe(false);
  });
});

describe('StudyBlockPatchSchema', () => {
  it('requires a date when status changes', () => {
    expect(StudyBlockPatchSchema.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(StudyBlockPatchSchema.safeParse({ status: 'DONE', date: '2026-10-19' }).success).toBe(
      true,
    );
  });

  it('allows a move without a status', () => {
    expect(StudyBlockPatchSchema.safeParse({ day: 'TUESDAY', startTime: '18:00' }).success).toBe(
      true,
    );
  });

  it('rejects an empty patch', () => {
    expect(StudyBlockPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('StudyPlanRequestSchema', () => {
  it('accepts an empty request for the original marks-only flow', () => {
    const parsed = StudyPlanRequestSchema.parse({});
    expect(parsed.modules).toEqual([]);
    expect(parsed.availability).toEqual([]);
  });

  it('rejects a reversed availability window', () => {
    const result = StudyPlanRequestSchema.safeParse({
      availability: [{ day: 'MONDAY', startTime: '18:00', endTime: '17:00' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a module code with unsafe characters', () => {
    const result = StudyPlanRequestSchema.safeParse({
      modules: [{ code: '<script>', difficulty: 3 }],
    });
    expect(result.success).toBe(false);
  });
});
