/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import AppError from "../../error/appError";
import { ChatService } from "./chat.service";
import { TMessageType } from "./chat.interface";
import { emitToConversation, emitToUser } from "../../socket";

const startConversation = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await ChatService.getOrCreateConversation(
    userId,
    req.body.receiverId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Conversation ready",
    data: result,
  });
});

const getMyConversations = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await ChatService.getMyConversations(userId, req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Conversations retrieved successfully",
    data: result,
  });
});

const getMessages = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await ChatService.getMessages(
    userId,
    req.params.conversationId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Messages retrieved successfully",
    data: result,
  });
});

// Send a message in one REST call — text only, file only, or text + file.
// Still broadcasts over socket so connected clients get it in real time.
const sendMessage = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const role = (req as any).user.role;
  const conversationId = req.params.conversationId;

  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let fileSize: number | undefined;
  let messageType: TMessageType = "text";

  if (req.file) {
    fileUrl = `/uploads/profiles/${req.file.filename}`;
    fileName = req.file.originalname;
    fileSize = req.file.size;
    messageType = req.file.mimetype.startsWith("image/")
      ? "image"
      : req.file.mimetype === "application/pdf"
        ? "pdf"
        : "file";
  }

  if (messageType === "text" && !req.body.text) {
    throw new AppError(400, "Message must contain text or a file");
  }

  const { message, receiverId } = await ChatService.createMessage(userId, role, {
    conversationId,
    content: req.body.text,
    messageType,
    fileUrl,
    fileName,
    fileSize,
  });

  // real-time delivery
  emitToConversation(conversationId, "message:new", message.toObject());
  if (receiverId) {
    emitToUser(receiverId, "notification:message", {
      conversationId,
      senderId: userId,
      preview: req.body.text || "📎 Attachment",
    });
  }

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Message sent successfully",
    data: message,
  });
});

// Edit a message (REST) — also broadcasts message:edited over socket.
const editMessage = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const message = await ChatService.editMessage(req.params.messageId, userId, {
    content: req.body.content,
    fileUrl: req.body.fileUrl,
    fileName: req.body.fileName,
    fileSize: req.body.fileSize,
    messageType: req.body.messageType,
  });
  emitToConversation(String(message.conversation), "message:edited", {
    _id: String(message._id),
    content: message.content,
    messageType: message.messageType,
    fileUrl: message.fileUrl,
    fileName: message.fileName,
    fileSize: message.fileSize,
    isEdited: true,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Message edited successfully",
    data: message,
  });
});

// Delete a message (REST) — also broadcasts message:deleted over socket.
const deleteMessage = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const deleteFor = req.body.deleteFor === "me" ? "me" : "everyone";
  const result = await ChatService.deleteMessage(
    req.params.messageId,
    userId,
    deleteFor,
  );
  if (result.deleteFor === "everyone") {
    emitToConversation(result.conversationId, "message:deleted", {
      messageId: req.params.messageId,
      deleteFor,
    });
  } else {
    emitToUser(userId, "message:deleted", {
      messageId: req.params.messageId,
      deleteFor,
    });
  }
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Message deleted successfully",
    data: null,
  });
});

// Mark all incoming messages in a conversation as read (REST).
const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const conversationId = req.params.conversationId;
  await ChatService.markMessagesRead(conversationId, userId);
  emitToConversation(conversationId, "messages:read", { conversationId, userId });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Messages marked as read",
    data: null,
  });
});

// Upload a chat attachment, then emit `message:send` over socket with the
// returned fileUrl/fileName/fileSize.
const uploadFile = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "No file uploaded");

  const isImage = req.file.mimetype.startsWith("image/");
  const isPdf = req.file.mimetype === "application/pdf";

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "File uploaded successfully",
    data: {
      fileUrl: `/uploads/profiles/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      messageType: isImage ? "image" : isPdf ? "pdf" : "file",
    },
  });
});

export const ChatController = {
  startConversation,
  getMyConversations,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  uploadFile,
};
