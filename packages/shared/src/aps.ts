/**
 * Admission Point Score (APS) calculator. Pure, deterministic, no I/O.
 *
 * Why this exists as code and not as a prompt: the AI must never do arithmetic. An APS that
 * is "roughly right" sends a learner to apply for a course they cannot enter, or stops them
 * applying for one they can. The score is computed here, unit tested, and the AI is only ever
 * given the finished number to explain.
 *
 * The scale (NSC achievement levels, the common South African convention):
 *   80 to 100% -> 7 points
 *   70 to 79%  -> 6 points
 *   60 to 69%  -> 5 points
 *   50 to 59%  -> 4 points
 *   40 to 49%  -> 3 points
 *   30 to 39%  -> 2 points
 *   0 to 29%   -> 1 point
 *
 * Important, and stated because it is the part institutions disagree about: a real APS is a
 * per-institution policy. Many universities count only the best six subjects, some exclude
 * Life Orientation, some require specific subjects at a minimum level, and some add a bonus
 * for Maths or a Home Language. This function computes the raw score from a rule set so a
 * policy can be applied without changing the arithmetic, and every result carries the rule
 * that produced it so the UI can say "why" rather than showing a bare number.
 */
import type { FieldOfStudy } from './constants';

/** NSC achievement points for a percentage. Exported so the bands are testable directly. */
export function pointsForMark(mark: number): number {
  if (mark >= 80) return 7;
  if (mark >= 70) return 6;
  if (mark >= 60) return 5;
  if (mark >= 50) return 4;
  if (mark >= 40) return 3;
  if (mark >= 30) return 2;
  return 1;
}

export type ApsSubject = {
  subject: string;
  mark: number;
  isHomeLanguage?: boolean;
};

export type ApsRule = {
  /** Count only this many best subjects. Six is the most common university policy. */
  bestSubjects?: number;
  /** Exclude Life Orientation from the score, as most universities do. */
  excludeLifeOrientation?: boolean;
  /** Exclude the Home Language from the score, as some institutions do. */
  excludeHomeLanguage?: boolean;
};

export const DEFAULT_APS_RULE: Required<ApsRule> = {
  bestSubjects: 6,
  excludeLifeOrientation: true,
  excludeHomeLanguage: false,
};

export type ApsInput = {
  /** Marks may be null-safe: a learner fills these in over several screens. */
  marks: ApsSubject[];
  rule?: ApsRule;
};

export type ApsCountedSubject = {
  subject: string;
  mark: number;
  points: number;
};

export type ApsResult = {
  /** The APS total, out of 7 points per counted subject. */
  score: number;
  /** The maximum possible under this rule, so the UI can show "24 of 42". */
  maxScore: number;
  /** Which subjects were counted, and the points each contributed. */
  counted: ApsCountedSubject[];
  /** Which subjects were present but excluded, and why. Shown in the "why" explanation. */
  excluded: { subject: string; reason: 'LIFE_ORIENTATION' | 'HOME_LANGUAGE' | 'NOT_BEST' | 'NO_MARK' }[];
  /** The rule actually applied, echoed back so the UI never has to guess. */
  ruleApplied: Required<ApsRule>;
};

/**
 * Compute the APS. Returns a score of 0 with an empty `counted` list when there are no usable
 * marks, rather than throwing: an incomplete profile is a normal state, not an error.
 */
export function calculateAps(input: ApsInput): ApsResult {
  const rule: Required<ApsRule> = { ...DEFAULT_APS_RULE, ...input.rule };

  const excluded: ApsResult['excluded'] = [];

  const candidates = input.marks
    .filter((subject) => {
      const name = subject.subject.trim();
      if (!name) {
        excluded.push({ subject: subject.subject, reason: 'NO_MARK' });
        return false;
      }
      if (rule.excludeLifeOrientation && isLifeOrientation(name)) {
        excluded.push({ subject: name, reason: 'LIFE_ORIENTATION' });
        return false;
      }
      if (rule.excludeHomeLanguage && subject.isHomeLanguage) {
        excluded.push({ subject: name, reason: 'HOME_LANGUAGE' });
        return false;
      }
      if (!Number.isFinite(subject.mark)) {
        excluded.push({ subject: name, reason: 'NO_MARK' });
        return false;
      }
      return true;
    })
    .map((subject) => ({
      subject: subject.subject.trim(),
      mark: clampMark(subject.mark),
      points: pointsForMark(clampMark(subject.mark)),
    }))
    // Highest points first; ties broken by mark then subject name so the result is stable
    // and two runs on the same input always produce the same output.
    .sort((a, b) => b.points - a.points || b.mark - a.mark || (a.subject < b.subject ? -1 : 1));

  const counted = candidates.slice(0, rule.bestSubjects);
  for (const dropped of candidates.slice(rule.bestSubjects)) {
    excluded.push({ subject: dropped.subject, reason: 'NOT_BEST' });
  }

  return {
    score: counted.reduce((total, subject) => total + subject.points, 0),
    maxScore: rule.bestSubjects * 7,
    counted,
    excluded,
    ruleApplied: rule,
  };
}

/** Marks outside 0 to 100 are clamped rather than rejected: the schema already blocks them. */
function clampMark(mark: number): number {
  return Math.max(0, Math.min(100, Math.round(mark)));
}

/** Life Orientation is named inconsistently in the wild, so match the common forms. */
function isLifeOrientation(subject: string): boolean {
  const normalised = subject.toLowerCase().replace(/[^a-z]/g, '');
  return normalised === 'lifeorientation' || normalised === 'lo';
}

/**
 * Subjects a course cares about, keyed by field. This is intentionally broad and honest: it
 * is a starting point for requirements, not a claim about any specific institution, and
 * seed data derived from it is labelled "sample, verify before use".
 */
export const FIELD_REQUIRED_SUBJECTS: Record<FieldOfStudy, { subject: string; minMark: number }[]> = {
  AGRICULTURE: [{ subject: 'Mathematics', minMark: 50 }, { subject: 'Agricultural Sciences', minMark: 50 }],
  BUSINESS: [{ subject: 'Mathematics', minMark: 50 }],
  COMMERCE: [{ subject: 'Mathematics', minMark: 50 }],
  COMPUTING: [{ subject: 'Mathematics', minMark: 60 }],
  DATA_SCIENCE: [{ subject: 'Mathematics', minMark: 60 }],
  EDUCATION: [{ subject: 'English', minMark: 50 }],
  ENGINEERING: [{ subject: 'Mathematics', minMark: 60 }, { subject: 'Physical Sciences', minMark: 60 }],
  HEALTH_SCIENCES: [{ subject: 'Mathematics', minMark: 60 }, { subject: 'Physical Sciences', minMark: 60 }],
  HUMANITIES: [{ subject: 'English', minMark: 50 }],
  LAW: [{ subject: 'English', minMark: 60 }],
  NURSING: [{ subject: 'Mathematics', minMark: 50 }, { subject: 'Life Sciences', minMark: 50 }],
  SCIENCE: [{ subject: 'Mathematics', minMark: 60 }, { subject: 'Physical Sciences', minMark: 50 }],
  SOCIAL_WORK: [{ subject: 'English', minMark: 50 }],
  TEACHING: [{ subject: 'English', minMark: 50 }],
  TVET_TRADES: [],
};

export type SubjectShortfall = {
  subject: string;
  required: number;
  actual: number | null;
  /** How many percentage points short, or 0 when the requirement is met. */
  gap: number;
};

/**
 * Compare a learner's marks against a field's subject requirements. Returns only the
 * shortfalls, so the caller can say "raise Maths by 8%" rather than listing what already
 * passes. `actual` is null when the learner has no mark for a required subject at all, which
 * is a different message ("you need Maths") from being below the bar.
 */
export function findSubjectShortfalls(
  field: FieldOfStudy,
  marks: ApsSubject[],
): SubjectShortfall[] {
  const byName = new Map(marks.map((m) => [m.subject.trim().toLowerCase(), m.mark]));
  const shortfalls: SubjectShortfall[] = [];

  // The record is exhaustive over FieldOfStudy, so this lookup is always defined at runtime.
  // The fallback keeps `noUncheckedIndexedAccess` honest without a non-null assertion, and
  // an unknown field degrades to "no requirements" rather than throwing.
  const requirements = FIELD_REQUIRED_SUBJECTS[field] ?? [];

  for (const requirement of requirements) {
    const actual = byName.get(requirement.subject.toLowerCase()) ?? null;
    if (actual === null || actual < requirement.minMark) {
      shortfalls.push({
        subject: requirement.subject,
        required: requirement.minMark,
        actual,
        gap: actual === null ? requirement.minMark : requirement.minMark - actual,
      });
    }
  }

  return shortfalls;
}