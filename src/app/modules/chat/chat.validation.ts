import { z } from "zod";

export const startConversationSchema = z.object({
  receiverId: z.string().min(1, "receiverId is required"),
});

// text is optional — a message may be text-only, file-only, or text + file.
// (at least one is enforced in the service)
export const sendMessageSchema = z.object({
  text: z.string().optional(),
});

// content OR a replacement file may change; the service enforces the message
// still carries either text or an attachment after the edit.
export const editMessageSchema = z.object({
  content: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.coerce.number().optional(),
  messageType: z.enum(["text", "image", "pdf", "file"]).optional(),
});

export const deleteMessageSchema = z.object({
  deleteFor: z.enum(["me", "everyone"]).default("everyone"),
});
