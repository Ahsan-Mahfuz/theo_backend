/* eslint-disable @typescript-eslint/no-explicit-any */
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import config from "../config";
import { ITokenPayload } from "../modules/auth/auth.interface";
import { ChatService } from "../modules/chat/chat.service";

let io: Server | null = null;

const userRoom = (userId: string) => `user:${userId}`;
const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

// ─── Online presence: userId -> set of active socket ids ──────────────────────
const online = new Map<string, Set<string>>();

const addOnline = (userId: string, socketId: string) => {
  if (!online.has(userId)) online.set(userId, new Set());
  online.get(userId)!.add(socketId);
};
const removeOnline = (userId: string, socketId: string) => {
  const set = online.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) online.delete(userId);
};
const onlineUserIds = () => Array.from(online.keys());

// normalises both "id" (string) and { conversationId } payload shapes
const pickConversationId = (p: any): string | undefined =>
  typeof p === "string" ? p : p?.conversationId;

/**
 * Initialise Socket.io. Client connects with { auth: { token: "<JWT>" } }.
 */
export const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // ─── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization as string)?.split(" ")[1];
      if (!token) return next(new Error("Unauthorized – no token"));

      const decoded = jwt.verify(
        token,
        config.jwt_access_secret as string,
      ) as ITokenPayload;
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error("Unauthorized – invalid token"));
    }
  });

  // ─── Connection ───────────────────────────────────────────────────────────────
  io.on("connection", (socket: Socket) => {
    const user = (socket as any).user as ITokenPayload;
    const userId = user.userId;

    socket.join(userRoom(userId));
    addOnline(userId, socket.id);
    io!.emit("users:online", onlineUserIds());
    console.log(`🔌 connected: ${userId}`);

    // client may explicitly announce itself
    socket.on("user:online", () => {
      io!.emit("users:online", onlineUserIds());
    });

    // ─── Conversation rooms ─────────────────────────────────────────────────────
    socket.on("conversation:join", (payload: any) => {
      const id = pickConversationId(payload);
      if (id) socket.join(conversationRoom(id));
    });
    socket.on("conversation:leave", (payload: any) => {
      const id = pickConversationId(payload);
      if (id) socket.leave(conversationRoom(id));
    });

    // ─── Send a message ─────────────────────────────────────────────────────────
    socket.on("message:send", async (payload: any) => {
      try {
        const { message, receiverId } = await ChatService.createMessage(
          userId, // authoritative sender — client value ignored
          user.role,
          {
            conversationId: payload.conversationId,
            content: payload.content,
            messageType: payload.messageType,
            fileUrl: payload.fileUrl,
            fileName: payload.fileName,
            fileSize: payload.fileSize,
            receiverRole: payload.receiverRole,
          },
        );

        const out = { ...message.toObject(), tempId: payload.tempId };

        // deliver to everyone viewing the conversation (sender + receiver)
        io!.to(conversationRoom(payload.conversationId)).emit("message:new", out);

        // global badge for the receiver if they're not in the room
        if (receiverId) {
          io!.to(userRoom(receiverId)).emit("notification:message", {
            conversationId: payload.conversationId,
            senderId: userId,
            preview: payload.content || "📎 Attachment",
          });
        }
      } catch (err: any) {
        socket.emit("message:error", { error: err?.message || "Failed to send" });
      }
    });

    // ─── Edit a message ─────────────────────────────────────────────────────────
    socket.on("message:edit", async (payload: any) => {
      try {
        const message = await ChatService.editMessage(
          payload.messageId,
          userId,
          payload.content,
        );
        io!
          .to(conversationRoom(String(message.conversation)))
          .emit("message:edited", { _id: String(message._id), content: message.content });
      } catch (err: any) {
        socket.emit("message:error", { error: err?.message || "Failed to edit" });
      }
    });

    // ─── Delete a message ───────────────────────────────────────────────────────
    socket.on("message:delete", async (payload: any) => {
      try {
        const { conversationId, deleteFor } = await ChatService.deleteMessage(
          payload.messageId,
          userId,
          payload.deleteFor === "me" ? "me" : "everyone",
        );
        if (deleteFor === "everyone") {
          io!
            .to(conversationRoom(conversationId))
            .emit("message:deleted", { messageId: payload.messageId, deleteFor });
        } else {
          // "me" — only echo back to this user
          io!
            .to(userRoom(userId))
            .emit("message:deleted", { messageId: payload.messageId, deleteFor });
        }
      } catch (err: any) {
        socket.emit("message:error", { error: err?.message || "Failed to delete" });
      }
    });

    // ─── Read receipts ──────────────────────────────────────────────────────────
    socket.on("messages:read", async (payload: any) => {
      try {
        const conversationId = pickConversationId(payload);
        if (!conversationId) return;
        await ChatService.markMessagesRead(conversationId, userId);
        io!
          .to(conversationRoom(conversationId))
          .emit("messages:read", { conversationId, userId });
      } catch (err: any) {
        socket.emit("message:error", { error: err?.message || "Failed to mark read" });
      }
    });

    // ─── Typing indicators ──────────────────────────────────────────────────────
    socket.on("typing:start", (payload: any) => {
      const id = pickConversationId(payload);
      if (id) socket.to(conversationRoom(id)).emit("typing:start", { userId });
    });
    socket.on("typing:stop", (payload: any) => {
      const id = pickConversationId(payload);
      if (id) socket.to(conversationRoom(id)).emit("typing:stop", { userId });
    });

    // ─── Disconnect ─────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      removeOnline(userId, socket.id);
      io!.emit("users:online", onlineUserIds());
      console.log(`🔌 disconnected: ${userId}`);
    });
  });

  return io;
};

export const getIO = (): Server | null => io;

/** Emit an event to a specific user's personal room (usable from any module). */
export const emitToUser = (userId: string, event: string, payload: unknown) => {
  io?.to(userRoom(userId)).emit(event, payload);
};

/** Emit an event to everyone currently in a conversation room. */
export const emitToConversation = (
  conversationId: string,
  event: string,
  payload: unknown,
) => {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
};

/** Whether a user currently has at least one live socket connection. */
export const isUserOnline = (userId: string) => online.has(userId);
