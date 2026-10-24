import { z } from 'zod';
import { MAX_SUBJECT_CHARS } from '../constants';

/**
 * Subject marks. `POST /api/marks` is marked idempotent in the build instructions, so the
 * caller sends an Idempotency-Key and a repeat tap cannot create duplicates on top of the
 * per-subject uniqueness the database already enforces.
 *
 * A single mark per request on purpose. The subject list is small, the learner adds them one
 * screen at a time, and a one-item body keeps the request hash meaningful for idempotency.
 */
export const markCreateSchema = z
  .object({
    subject: z.string().trim().min(1).max(MAX_SUBJECT_CHARS),
    mark: z.number().int().min(0).max(100),
    isHomeLanguage: z.boolean().optional(),
  })
  .strict();

export type MarkCreateInput = z.infer<typeof markCreateSchema>;