import { z } from "zod";

export const contentTypes = [
  "about_us",
  "terms_of_use",
  "privacy_policy",
  "legal_notice",
] as const;

export const upsertContentSchema = z.object({
  content: z.string().min(1, "Content is required"),
});
