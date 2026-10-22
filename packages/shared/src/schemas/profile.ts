import { z } from 'zod';
import {
  FIELDS_OF_STUDY,
  LANGUAGES,
  PROFILE_LIMITS,
  PROVINCES,
  QUALIFICATION_STATUSES,
  SCHOOL_QUALIFICATIONS,
  STUDY_MODES,
} from '../constants';

/**
 * Profile update. Every field is optional so a learner can save one screen at a time
 * without having to resend the whole profile, but each field that is present is validated
 * strictly: type, length and enum membership.
 *
 * Deliberate omissions, so they are not "fixed" later by accident:
 *   - No ID number. It is collected only at the point of an application that needs it.
 *   - No role, no email, no emailVerified. Those are better-auth's, not the learner's.
 *   - No userId. It comes from the session, never from the body.
 */
export const profileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(PROFILE_LIMITS.fullName).optional(),
    phone: z
      .string()
      .trim()
      .max(PROFILE_LIMITS.phone)
      // Loose on format on purpose: international and local forms both appear, and a
      // stricter pattern rejects real learners. Length is the control here.
      .regex(/^[0-9+()\s-]*$/, 'phone may contain digits, spaces and + ( ) - only')
      .optional(),
    province: z.enum(PROVINCES).optional(),
    qualificationStatus: z.enum(QUALIFICATION_STATUSES).optional(),
    grade: z.number().int().min(8).max(12).optional(),
    schoolQualification: z.enum(SCHOOL_QUALIFICATIONS).optional(),
    interests: z.string().trim().max(PROFILE_LIMITS.interests).optional(),
    /**
     * The `YYYY-MM-DD` value from an `<input type="date">`. The API turns this into a Date
     * and checks the age; keeping the transport as a string avoids timezone drift between
     * the browser and the server.
     */
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
      }, 'enter a valid date')
      .refine(
        (value) => new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now(),
        'date of birth cannot be in the future',
      )
      .optional(),
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Study preferences update. Same rule: optional fields, strict validation.
 *
 * Two subtleties worth keeping:
 *   - `fields` and `provinces` are deduplicated and capped, so a client cannot send a
 *     thousand entries and turn a preference row into a denial-of-service vector.
 *   - An empty `provinces` array means "no preference", which is different from an
 *     absent field meaning "leave the current value alone".
 */
export const preferenceUpdateSchema = z
  .object({
    fields: z
      .array(z.enum(FIELDS_OF_STUDY))
      .max(FIELDS_OF_STUDY.length)
      .transform((values) => [...new Set(values)])
      .optional(),
    provinces: z
      .array(z.enum(PROVINCES))
      .max(PROVINCES.length)
      .transform((values) => [...new Set(values)])
      .optional(),
    budgetCeiling: z.number().int().min(0).max(1_000_000).nullable().optional(),
    studyMode: z.enum(STUDY_MODES).nullable().optional(),
    language: z.enum(LANGUAGES).optional(),
    lowDataMode: z.boolean().optional(),
  })
  .strict();

export type PreferenceUpdateInput = z.infer<typeof preferenceUpdateSchema>;