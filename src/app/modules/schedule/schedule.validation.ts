import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm 24h

export const createScheduleSchema = z.object({
  // which assigned cleaner (primary/substitute) to schedule this cleaning for
  cleanerId: z.string().min(1, "cleanerId is required"),
  date: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
  checkInTime: z.string().regex(timeRegex, "checkInTime must be HH:mm"),
  checkOutTime: z.string().regex(timeRegex, "checkOutTime must be HH:mm"),
  notes: z.string().optional(),
  bookingId: z.string().optional(), // optional iCal booking to link this cleaning to
});

// host edits an existing schedule (all fields optional)
export const updateScheduleSchema = z.object({
  // optionally re-assign to a different accepted cleaner
  cleanerId: z.string().min(1).optional(),
  date: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), "Invalid date")
    .optional(),
  checkInTime: z.string().regex(timeRegex, "checkInTime must be HH:mm").optional(),
  checkOutTime: z
    .string()
    .regex(timeRegex, "checkOutTime must be HH:mm")
    .optional(),
  notes: z.string().optional(),
});

// proof / dispute come through multipart (photos[]); notes are optional strings
export const submitProofSchema = z.object({
  proofNotes: z.string().optional(),
});

export const disputeSchema = z.object({
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const respondScheduleSchema = z.object({
  action: z.enum(["accept", "refuse"]),
});

// host rejects the submitted proof (optional reason shown to the cleaner)
export const invalidateProofSchema = z.object({
  reason: z.string().optional(),
});
