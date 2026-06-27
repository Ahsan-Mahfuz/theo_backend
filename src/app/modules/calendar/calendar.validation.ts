import { z } from "zod";

const platformEnum = z.enum([
  "airbnb",
  "booking",
  "vrbo",
  "expedia",
  "tripadvisor",
  "google",
  "apple",
  "outlook",
  "other",
]);

export const addConnectionSchema = z.object({
  platform: platformEnum.optional(),
  label: z.string().optional(),
  icalUrl: z.string().url("icalUrl must be a valid URL"),
});
