import { Document, Types } from "mongoose";

export interface IConversation extends Document {
  participants: Types.ObjectId[]; // exactly two: host & cleaner
  lastMessage?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type TMessageType = "text" | "image" | "pdf" | "file";
export type TMessageStatus = "sent" | "delivered" | "read";
export type TDeleteFor = "me" | "everyone";

export interface IMessage extends Document {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  receiver?: Types.ObjectId;
  senderRole?: string; // host | cleaner | admin
  receiverRole?: string;
  content?: string; // text body
  messageType: TMessageType;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  status: TMessageStatus;
  isRead: boolean;
  isEdited: boolean;
  isDeleted: boolean; // deleted for everyone
  deletedFor: Types.ObjectId[]; // "delete for me" — hidden for these users
  createdAt: Date;
  updatedAt: Date;
}
