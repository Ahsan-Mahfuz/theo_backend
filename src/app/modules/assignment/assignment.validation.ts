import { z } from "zod";

export const assignCleanerSchema = z.object({
  cleanerId: z.string().min(1, "cleanerId is required"),
  role: z.enum(["primary", "substitute"]).default("substitute"),
  pricePerCleaning: z.number().min(0).optional(),
  message: z.string().optional(),
});

export const respondAssignmentSchema = z.object({
  action: z.enum(["accept", "refuse"]),
});

export const changeRoleSchema = z.object({
  role: z.enum(["primary", "substitute"]),
});
