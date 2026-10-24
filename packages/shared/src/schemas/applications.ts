import { z } from 'zod';

export const ApplicationCreateSchema = z.object({
  courseId: z.string().min(1),
});

export type ApplicationCreate = z.infer<typeof ApplicationCreateSchema>;

export const ApplicationStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'OFFER_ISSUED',
  'ACCEPTED',
  'DECLINED',
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

/**
 * The only legal forward paths. Keeping this next to the Zod status enum means the API and
 * the UI can ask the same question instead of each reimplementing the rules.
 *
 * DECLINED is reachable from any live status: a learner or institution can close a process.
 * It is never reachable from ACCEPTED, and nothing is reachable from a terminal status.
 */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  DRAFT: ['SUBMITTED', 'DECLINED'],
  SUBMITTED: ['UNDER_REVIEW', 'DECLINED'],
  UNDER_REVIEW: ['OFFER_ISSUED', 'DECLINED'],
  OFFER_ISSUED: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: [],
  DECLINED: [],
};

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export const OfferDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'DECLINE']),
});

export type OfferDecision = z.infer<typeof OfferDecisionSchema>;
