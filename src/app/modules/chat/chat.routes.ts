import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { uploadAny } from "../../middleware/multer";
import { ChatController } from "./chat.controller";
import {
  startConversationSchema,
  sendMessageSchema,
  editMessageSchema,
  deleteMessageSchema,
} from "./chat.validation";

const router = express.Router();

// NOTE: sending / editing / deleting / read-receipts / typing all happen over
// Socket.io (see src/app/socket). These REST routes cover conversation setup,
// history (pagination) and file upload.

// POST /api/v1/chat/conversation — start/get a conversation
router.post(
  "/conversation",
  auth("admin", "host", "cleaner"),
  validateRequest(startConversationSchema),
  ChatController.startConversation,
);

// GET /api/v1/chat/conversations — my conversations (?page&limit)
router.get(
  "/conversations",
  auth("admin", "host", "cleaner"),
  ChatController.getMyConversations,
);

// POST /api/v1/chat/upload — upload an attachment (formdata: file)
router.post(
  "/upload",
  auth("admin", "host", "cleaner"),
  uploadAny.single("file"),
  ChatController.uploadFile,
);

// PATCH /api/v1/chat/messages/:messageId — edit a message (text only, sender only)
// Registered before the :conversationId routes so "messages" is matched literally.
router.patch(
  "/messages/:messageId",
  auth("admin", "host", "cleaner"),
  validateRequest(editMessageSchema),
  ChatController.editMessage,
);

// DELETE /api/v1/chat/messages/:messageId — delete a message ({ deleteFor })
router.delete(
  "/messages/:messageId",
  auth("admin", "host", "cleaner"),
  validateRequest(deleteMessageSchema),
  ChatController.deleteMessage,
);

// POST /api/v1/chat/:conversationId/messages — send in one call
// formdata: text (optional), file (optional) — at least one required.
// Also broadcasts message:new over socket.
router.post(
  "/:conversationId/messages",
  auth("admin", "host", "cleaner"),
  uploadAny.single("file"),
  validateRequest(sendMessageSchema),
  ChatController.sendMessage,
);

// GET /api/v1/chat/:conversationId/messages — history (?page&limit)
router.get(
  "/:conversationId/messages",
  auth("admin", "host", "cleaner"),
  ChatController.getMessages,
);

// PATCH /api/v1/chat/:conversationId/read — mark messages as read
router.patch(
  "/:conversationId/read",
  auth("admin", "host", "cleaner"),
  ChatController.markAsRead,
);

export const ChatRoutes = router;
