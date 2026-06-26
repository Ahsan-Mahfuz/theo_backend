import { Schema, model } from "mongoose";
import { ISupportTicket } from "./support.interface";

const supportSchema = new Schema<ISupportTicket>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    subject: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
    },
  },
  { timestamps: true },
);

export const SupportTicket = model<ISupportTicket>(
  "SupportTicket",
  supportSchema,
);
