/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { Conversation, Message } from "./chat.model";
import { TDeleteFor, TMessageType } from "./chat.interface";
import { User } from "../user/user.model";
import AppError from "../../error/appError";
import { NotificationService } from "../notification/notification.service";

const PARTICIPANT_FIELDS = "firstName lastName name profileImage role";

// ─── Start or fetch a 1-to-1 conversation ─────────────────────────────────────
const getOrCreateConversation = async (userId: string, receiverId: string) => {
  if (userId === receiverId) {
    throw new AppError(400, "You cannot start a conversation with yourself");
  }
  const receiver = await User.findById(receiverId);
  if (!receiver || receiver.isDeleted) throw new AppError(404, "User not found");

  let conversation = await Conversation.findOne({
    participants: { $all: [userId, receiverId], $size: 2 },
  }).populate("participants", PARTICIPANT_FIELDS);

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, receiverId],
    });
    conversation = await conversation.populate("participants", PARTICIPANT_FIELDS);
  }

  return conversation;
};

// ─── My conversations (inbox) ─────────────────────────────────────────────────
const getMyConversations = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { participants: userId };

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .populate("participants", PARTICIPANT_FIELDS)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Conversation.countDocuments(filter),
  ]);

  const data = await Promise.all(
    conversations.map(async (c) => {
      const unreadCount = await Message.countDocuments({
        conversation: c._id,
        sender: { $ne: userId },
        isRead: false,
        deletedFor: { $ne: userId },
      });
      return { ...c.toObject(), unreadCount };
    }),
  );

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Messages of a conversation (paginated, newest first) ─────────────────────
const getMessages = async (
  userId: string,
  conversationId: string,
  query: Record<string, unknown>,
) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });
  if (!conversation) throw new AppError(404, "Conversation not found");

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 30;
  const skip = (page - 1) * limit;

  const filter = {
    conversation: conversationId,
    deletedFor: { $ne: userId }, // hide messages this user deleted "for me"
  };

  const [data, total] = await Promise.all([
    Message.find(filter)
      .populate("sender", PARTICIPANT_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Message.countDocuments(filter),
  ]);

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Create a message (called by the socket layer) ────────────────────────────
const createMessage = async (
  senderId: string,
  senderRole: string | undefined,
  payload: {
    conversationId: string;
    content?: string;
    messageType?: TMessageType;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    receiverRole?: string;
  },
) => {
  const conversation = await Conversation.findOne({
    _id: payload.conversationId,
    participants: senderId,
  });
  if (!conversation) throw new AppError(404, "Conversation not found");

  const messageType = payload.messageType || "text";
  if (messageType === "text" && !payload.content) {
    throw new AppError(400, "Text message requires content");
  }
  if (messageType !== "text" && !payload.fileUrl) {
    throw new AppError(400, "File message requires fileUrl");
  }

  const receiverId = conversation.participants
    .map(String)
    .find((p) => p !== senderId);

  let message = await Message.create({
    conversation: payload.conversationId,
    sender: senderId,
    receiver: receiverId,
    senderRole,
    receiverRole: payload.receiverRole,
    content: payload.content,
    messageType,
    fileUrl: payload.fileUrl,
    fileName: payload.fileName,
    fileSize: payload.fileSize,
    status: "sent",
  });
  message = await message.populate("sender", PARTICIPANT_FIELDS);

  // prefer the caption/text for the inbox preview; fall back to an attachment label
  conversation.lastMessage =
    payload.content || (messageType === "text" ? "" : "📎 Attachment");
  conversation.lastMessageAt = new Date();
  await conversation.save();

  // persistent notification + push for the receiver (works while offline too)
  if (receiverId) {
    await NotificationService.createNotification({
      user: receiverId,
      title: "New message",
      message: payload.content || "Sent you an attachment",
      type: "message",
      data: { conversationId: payload.conversationId, messageId: String(message._id) },
    });
  }

  return { message, receiverId };
};

// ─── Edit a message ───────────────────────────────────────────────────────────
const editMessage = async (
  messageId: string,
  senderId: string,
  content: string,
) => {
  const message = await Message.findOne({ _id: messageId, sender: senderId });
  if (!message) throw new AppError(404, "Message not found");
  if (message.isDeleted) throw new AppError(400, "Cannot edit a deleted message");
  if (message.messageType !== "text") {
    throw new AppError(400, "Only text messages can be edited");
  }

  message.content = content;
  message.isEdited = true;
  await message.save();
  return message;
};

// ─── Delete a message (for me / for everyone) ─────────────────────────────────
const deleteMessage = async (
  messageId: string,
  userId: string,
  deleteFor: TDeleteFor,
) => {
  const message = await Message.findById(messageId);
  if (!message) throw new AppError(404, "Message not found");

  // user must be part of the conversation
  const conversation = await Conversation.findOne({
    _id: message.conversation,
    participants: userId,
  });
  if (!conversation) throw new AppError(403, "Not allowed");

  if (deleteFor === "everyone") {
    if (String(message.sender) !== userId) {
      throw new AppError(403, "Only the sender can delete for everyone");
    }
    message.isDeleted = true;
    message.content = "";
    message.fileUrl = undefined;
    await message.save();
  } else {
    if (!message.deletedFor.map(String).includes(userId)) {
      message.deletedFor.push(new Types.ObjectId(userId));
      await message.save();
    }
  }

  return { conversationId: String(message.conversation), deleteFor };
};

// ─── Mark all incoming messages as read ───────────────────────────────────────
const markMessagesRead = async (conversationId: string, userId: string) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });
  if (!conversation) throw new AppError(404, "Conversation not found");

  await Message.updateMany(
    { conversation: conversationId, sender: { $ne: userId }, isRead: false },
    { isRead: true, status: "read" },
  );
  return true;
};

export const ChatService = {
  getOrCreateConversation,
  getMyConversations,
  getMessages,
  createMessage,
  editMessage,
  deleteMessage,
  markMessagesRead,
};
