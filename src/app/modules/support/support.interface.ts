import { Document, Types } from "mongoose";

export type TSupportStatus = "open" | "resolved";

export interface ISupportTicket extends Document {
  user?: Types.ObjectId; // set when submitted by a logged-in user
  subject: string;
  email: string;
  message: string;
  status: TSupportStatus;
  createdAt: Date;
  updatedAt: Date;
}
