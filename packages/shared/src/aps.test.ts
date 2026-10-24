import { describe, expect, it } from 'vitest';
import { calculateAps, findSubjectShortfalls, pointsForMark } from './aps';

describe('pointsForMark', () => {
  it('maps each band boundary to the correct NSC points', () => {
    expect(pointsForMark(100)).toBe(7);
    expect(pointsForMark(80)).toBe(7);
    expect(pointsForMark(79)).toBe(6);
    expect(pointsForMark(70)).toBe(6);
    expect(pointsForMark(69)).toBe(5);
    expect(pointsForMark(60)).toBe(5);
    expect(pointsForMark(59)).toBe(4);
    expect(pointsForMark(50)).toBe(4);
    expect(pointsForMark(49)).toBe(3);
    expect(pointsForMark(40)).toBe(3);
    expect(pointsForMark(39)).toBe(2);
    expect(pointsForMark(30)).toBe(2);
    expect(pointsForMark(29)).toBe(1);
    expect(pointsForMark(0)).toBe(1);
  });

  it('never returns a point value outside 1 to 7', () => {
    for (let mark = 0; mark <= 100; mark += 1) {
      const points = pointsForMark(mark);
      expect(points).toBeGreaterThanOrEqual(1);
      expect(points).toBeLessThanOrEqual(7);
    }
  });
});

describe('calculateAps', () => {
  const scienceMarks = [
    { subject: 'Mathematics', mark: 82 },
    { subject: 'Physical Sciences', mark: 74 },
    { subject: 'Life Sciences', mark: 68 },
    { subject: 'English', mark: 65, isHomeLanguage: true },
    { subject: 'isiZulu', mark: 88 },
    { subject: 'Geography', mark: 55 },
    { subject: 'Life Orientation', mark: 90 },
  ];

  it('counts the best six and excludes Life Orientation by default', () => {
    const result = calculateAps({ marks: scienceMarks });

    // Best six by points: isiZulu 7, Maths 7, PhysSci 6, LifeSci 5, English 5, Geography 4 = 34.
    expect(result.score).toBe(34);
    expect(result.maxScore).toBe(42);
    expect(result.counted).toHaveLength(6);
    expect(result.excluded).toContainEqual({ subject: 'Life Orientation', reason: 'LIFE_ORIENTATION' });
  });

  it('returns 0 and a full exclusion list when there are no usable marks', () => {
    const result = calculateAps({ marks: [] });
    expect(result.score).toBe(0);
    expect(result.counted).toEqual([]);
  });

  it('is stable: the same input always gives the same counted list', () => {
    const first = calculateAps({ marks: scienceMarks });
    const second = calculateAps({ marks: scienceMarks });
    expect(second.counted).toEqual(first.counted);
    expect(second.score).toBe(first.score);
  });

  it('breaks point ties by mark, then subject name, so order never changes the result', () => {
    const shuffled = [...scienceMarks].reverse();
    const result = calculateAps({ marks: shuffled });
    expect(result.score).toBe(34);
  });

  it('includes Life Orientation when the rule asks for it', () => {
    const withLo = calculateAps({ marks: scienceMarks, rule: { excludeLifeOrientation: false } });
    const without = calculateAps({ marks: scienceMarks });
    // Life Orientation is 90%, worth 7 points, so it should replace the weakest counted subject.
    expect(withLo.score).toBeGreaterThan(without.score);
    expect(withLo.counted.some((s) => s.subject === 'Life Orientation')).toBe(true);
  });

  it('excludes the home language when the rule asks for it', () => {
    const result = calculateAps({ marks: scienceMarks, rule: { excludeHomeLanguage: true } });
    expect(result.counted.some((s) => s.subject === 'English')).toBe(false);
    expect(result.excluded).toContainEqual({ subject: 'English', reason: 'HOME_LANGUAGE' });
  });

  it('respects a best-subjects count other than six', () => {
    const result = calculateAps({ marks: scienceMarks, rule: { bestSubjects: 3 } });
    expect(result.counted).toHaveLength(3);
    expect(result.maxScore).toBe(21);
    // Top three: isiZulu 7, Maths 7, PhysSci 6 = 20.
    expect(result.score).toBe(20);
  });

  it('marks subjects beyond the best-N count as NOT_BEST rather than dropping them silently', () => {
    const result = calculateAps({ marks: scienceMarks, rule: { bestSubjects: 3 } });
    expect(result.excluded.some((e) => e.reason === 'NOT_BEST')).toBe(true);
  });

  it('clamps an out-of-range mark instead of producing an impossible score', () => {
    const result = calculateAps({ marks: [{ subject: 'Mathematics', mark: 150 }] });
    expect(result.counted[0]?.mark).toBe(100);
    expect(result.counted[0]?.points).toBe(7);
  });

  it('trims subject names so whitespace cannot create a duplicate subject', () => {
    const result = calculateAps({ marks: [{ subject: '  Mathematics  ', mark: 80 }] });
    expect(result.counted[0]?.subject).toBe('Mathematics');
  });

  it('reports the rule it applied so the UI can explain the number', () => {
    const result = calculateAps({ marks: scienceMarks });
    expect(result.ruleApplied).toEqual({
      bestSubjects: 6,
      excludeLifeOrientation: true,
      excludeHomeLanguage: false,
    });
  });

  it('recognises "LO" as Life Orientation, since schools abbreviate it', () => {
    const result = calculateAps({ marks: [{ subject: 'LO', mark: 95 }, { subject: 'Mathematics', mark: 60 }] });
    expect(result.excluded).toContainEqual({ subject: 'LO', reason: 'LIFE_ORIENTATION' });
  });

  it('is monotonic: raising a mark can never lower the score', () => {
    const base = calculateAps({ marks: scienceMarks }).score;
    const improved = scienceMarks.map((m) =>
      m.subject === 'Geography' ? { ...m, mark: 95 } : m,
    );
    expect(calculateAps({ marks: improved }).score).toBeGreaterThanOrEqual(base);
  });
});

describe('findSubjectShortfalls', () => {
  it('lists only the requirements not met', () => {
    const marks = [
      { subject: 'Mathematics', mark: 72 },
      { subject: 'Physical Sciences', mark: 55 },
    ];
    const shortfalls = findSubjectShortfalls('ENGINEERING', marks);

    // Engineering needs Maths 60 (met) and Physical Sciences 60 (5 short).
    expect(shortfalls).toHaveLength(1);
    expect(shortfalls[0]).toEqual({
      subject: 'Physical Sciences',
      required: 60,
      actual: 55,
      gap: 5,
    });
  });

  it('reports a missing subject with a null actual, which is a different message', () => {
    const shortfalls = findSubjectShortfalls('NURSING', [{ subject: 'Mathematics', mark: 70 }]);
    const missing = shortfalls.find((s) => s.subject === 'Life Sciences');
    expect(missing?.actual).toBeNull();
    expect(missing?.gap).toBe(50);
  });

  it('matches subject names case-insensitively', () => {
    const shortfalls = findSubjectShortfalls('COMPUTING', [{ subject: 'mathematics', mark: 65 }]);
    expect(shortfalls).toHaveLength(0);
  });

  it('returns nothing for a field with no subject requirements', () => {
    expect(findSubjectShortfalls('TVET_TRADES', [])).toEqual([]);
  });
});