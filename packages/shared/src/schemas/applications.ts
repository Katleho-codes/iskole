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
