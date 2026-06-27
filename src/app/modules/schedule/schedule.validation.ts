import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm 24h

export const createScheduleSchema = z.object({
  date: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
  checkInTime: z.string().regex(timeRegex, "checkInTime must be HH:mm"),
  checkOutTime: z.string().regex(timeRegex, "checkOutTime must be HH:mm"),
  notes: z.string().optional(),
  bookingId: z.string().optional(), // optional iCal booking to link this cleaning to
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
