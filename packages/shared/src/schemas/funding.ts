import { z } from 'zod';

export const FundingOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  type: z.string(),
  description: z.string().nullable().optional(),
  eligibility: z.string().nullable().optional(),
  benefits: z.string().nullable().optional(),
  coversTuition: z.boolean(),
  coversAccommodation: z.boolean(),
  coversBooks: z.boolean(),
  coversAllowance: z.boolean(),
  amountMin: z.number().nullable().optional(),
  amountMax: z.number().nullable().optional(),
  deadline: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type FundingOption = z.infer<typeof FundingOptionSchema>;

export const FundingCompareQuerySchema = z.object({
  ids: z.string().min(1),
});

export type FundingCompareQuery = z.infer<typeof FundingCompareQuerySchema>;
