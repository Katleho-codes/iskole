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
