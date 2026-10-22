import { z } from 'zod';
import { LANGUAGES } from '../constants';

/** Opaque record id param used by every /:id route. Length-capped before it reaches Prisma. */
export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
});
export type IdParam = z.infer<typeof idParamSchema>;

/** Language preference for key screens. */
export const languageSchema = z.enum(LANGUAGES);
export type LanguageInput = z.infer<typeof languageSchema>;
