import { z } from 'zod';

/**
 * Guardian consent for a 16- or 17-year-old.
 *
 * `confirmed: true` is required so a client cannot record consent by omission. The contact
 * is deliberately loose: a guardian may give a phone number or an email address, and
 * rejecting a real one is worse than storing it as free text for a moderator to read. Length
 * and character allow-list are the controls.
 */
export const guardianConsentSchema = z
  .object({
    guardianName: z.string().trim().min(2, 'guardian name is too short').max(120),
    guardianContact: z
      .string()
      .trim()
      .min(5, 'guardian contact is too short')
      .max(160)
      .regex(
        /^[0-9A-Za-z@._+\-()\s]+$/,
        'guardian contact may contain letters, digits, spaces and @ . _ + - ( ) only',
      ),
    confirmed: z.literal(true, 'guardian consent must be confirmed'),
  })
  .strict();

export type GuardianConsentInput = z.infer<typeof guardianConsentSchema>;

/**
 * Learner-facing consent purposes. ESSENTIAL covers the account and the learning record;
 * the other two are optional choices a learner can make and revoke independently.
 *
 * Every write carries the policy version that was shown at the time. The version is stored
 * with the evidence, so a later policy change does not rewrite history.
 */
export const CONSENT_PURPOSES = ['ESSENTIAL', 'AI_STUDY_PLAN', 'TALENT_VISIBILITY'] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_POLICY_VERSION = '2026-10-23';

export const CONSENT_PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  ESSENTIAL: 'Account and learning record',
  AI_STUDY_PLAN: 'AI study-plan assistance',
  TALENT_VISIBILITY: 'Talent visibility to companies',
};

export const ConsentUpdateSchema = z
  .object({
    purpose: z.enum(CONSENT_PURPOSES),
    granted: z.boolean(),
    policyVersion: z.string().trim().min(1).max(40).default(CONSENT_POLICY_VERSION),
  })
  .strict();

export type ConsentUpdate = z.infer<typeof ConsentUpdateSchema>;
