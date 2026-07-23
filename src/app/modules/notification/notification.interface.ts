import { Document, Types } from "mongoose";

export type TNotificationType =
  // ─── Host / Cleaner (app + web) ───────────────────────────────────────────
  | "assignment_request" // host assigned a cleaner
  | "assignment_response" // cleaner accepted/refused
  | "schedule_created" // host scheduled a cleaning
  | "proof_submitted" // cleaner submitted proof
  | "task_completed" // host completed the task
  | "dispute" // cleaner reported a dispute
  | "message" // new chat message
  | "payment_received" // cleaner got paid / host charged
  // ─── Admin / Super Admin (dashboard only) ─────────────────────────────────
  | "new_user" // a new host/cleaner signed up
  | "support_ticket" // a new support request was opened
  | "admin_account" // an admin account was created/removed
  | "system" // system/broadcast announcement
  | "general";

export interface INotification extends Document {
  user: Types.ObjectId; // recipient
  title: string;
  message: string;
  titleFr?: string;
  messageFr?: string;
  type: TNotificationType;
  data?: Record<string, unknown>; // extra payload (ids, etc.)
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}
