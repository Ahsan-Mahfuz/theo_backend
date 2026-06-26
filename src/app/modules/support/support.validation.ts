import { z } from "zod";

export const createTicketSchema = z.object({
  subject: z.string().min(1, "Please choose a subject"),
  email: z.string().email("Invalid email address"),
  message: z
    .string()
    .min(1, "Message is required")
    .max(1000, "Message must be at most 1000 characters"),
});

export const updateTicketSchema = z.object({
  status: z.enum(["open", "resolved"]),
});
