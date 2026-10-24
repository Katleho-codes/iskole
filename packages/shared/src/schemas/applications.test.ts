import { describe, expect, it } from 'vitest';
import {
  APPLICATION_TRANSITIONS,
  ApplicationStatusSchema,
  canTransitionApplication,
} from './applications';

const ALL = ApplicationStatusSchema.options;

describe('application status transitions', () => {
  it('allows the intended forward path', () => {
    expect(canTransitionApplication('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransitionApplication('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionApplication('UNDER_REVIEW', 'OFFER_ISSUED')).toBe(true);
    expect(canTransitionApplication('OFFER_ISSUED', 'ACCEPTED')).toBe(true);
    expect(canTransitionApplication('OFFER_ISSUED', 'DECLINED')).toBe(true);
  });

  it.each([
    ['DRAFT', 'UNDER_REVIEW'],
    ['DRAFT', 'OFFER_ISSUED'],
    ['DRAFT', 'ACCEPTED'],
    ['SUBMITTED', 'OFFER_ISSUED'],
    ['SUBMITTED', 'ACCEPTED'],
    ['UNDER_REVIEW', 'ACCEPTED'],
    ['OFFER_ISSUED', 'DRAFT'],
    ['ACCEPTED', 'DECLINED'],
    ['ACCEPTED', 'OFFER_ISSUED'],
    ['DECLINED', 'ACCEPTED'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransitionApplication(from, to)).toBe(false);
  });

  it('never allows a status to transition to itself', () => {
    for (const status of ALL) {
      expect(canTransitionApplication(status, status)).toBe(false);
    }
  });

  it('terminates after ACCEPTED or DECLINED', () => {
    expect(APPLICATION_TRANSITIONS.ACCEPTED).toEqual([]);
    expect(APPLICATION_TRANSITIONS.DECLINED).toEqual([]);
  });
});
