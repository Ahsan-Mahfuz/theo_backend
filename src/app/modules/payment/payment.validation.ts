import { z } from "zod";

// country is optional (ISO-2); falls back to the cleaner's profile country
export const onboardSchema = z.object({
  country: z
    .string()
    .length(2, "country must be a 2-letter ISO code")
    .toUpperCase()
    .optional(),
});

export const refundSchema = z.object({
  reason: z.string().optional(),
});
