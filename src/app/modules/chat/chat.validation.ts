import { z } from "zod";

export const startConversationSchema = z.object({
  receiverId: z.string().min(1, "receiverId is required"),
});

// text is optional — a message may be text-only, file-only, or text + file.
// (at least one is enforced in the service)
export const sendMessageSchema = z.object({
  text: z.string().optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1, "content is required"),
});

export const deleteMessageSchema = z.object({
  deleteFor: z.enum(["me", "everyone"]).default("everyone"),
});
