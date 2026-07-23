import { Schema, model } from "mongoose";
import { INotification } from "./notification.interface";

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    titleFr: { type: String, required: false },
    messageFr: { type: String, required: false },
    type: {
      type: String,
      enum: [
        "assignment_request",
        "assignment_response",
        "schedule_created",
        "proof_submitted",
        "task_completed",
        "dispute",
        "message",
        "payment_received",
        "new_user",
        "support_ticket",
        "admin_account",
        "system",
        "general",
      ],
      default: "general",
    },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Notification = model<INotification>(
  "Notification",
  notificationSchema,
);
