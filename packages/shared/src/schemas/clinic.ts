import { z } from 'zod';

/**
 * Clinic booking reasons are a fixed list on purpose.
 *
 * A learner should be able to ask for help without typing a health detail into a database.
 * The advisor sees a category, enough to prepare, and nothing sensitive is stored.
 */
export const CLINIC_REASONS = [
  'FUNDING',
  'REGISTRATION',
  'STUDY_SKILLS',
  'WELLBEING',
  'OTHER',
] as const;

export type ClinicReason = (typeof CLINIC_REASONS)[number];

export const CLINIC_REASON_LABELS: Record<ClinicReason, string> = {
  FUNDING: 'Funding and NSFAS',
  REGISTRATION: 'Registration and documents',
  STUDY_SKILLS: 'Study skills and planning',
  WELLBEING: 'Wellbeing and support',
  OTHER: 'Something else',
};

export const ClinicBookingInputSchema = z
  .object({
    slotId: z.string().min(1).max(64),
    reason: z.enum(CLINIC_REASONS),
  })
  .strict();

export type ClinicBookingInput = z.infer<typeof ClinicBookingInputSchema>;
