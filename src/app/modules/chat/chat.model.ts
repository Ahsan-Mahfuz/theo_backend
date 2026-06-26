import { Schema, model } from "mongoose";
import { IConversation, IMessage } from "./chat.interface";

const conversationSchema = new Schema<IConversation>(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ],
    lastMessage: { type: String },
    lastMessageAt: { type: Date },
  },
  { timestamps: true },
);

const messageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User" },
    senderRole: { type: String },
    receiverRole: { type: String },
    content: { type: String },
    messageType: {
      type: String,
      enum: ["text", "image", "pdf", "file"],
      default: "text",
    },
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    isRead: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

export const Conversation = model<IConversation>(
  "Conversation",
  conversationSchema,
);
export const Message = model<IMessage>("Message", messageSchema);
