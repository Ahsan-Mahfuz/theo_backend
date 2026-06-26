import { Document, Types } from "mongoose";

export type TNotificationType =
  | "assignment_request" // host assigned a cleaner
  | "assignment_response" // cleaner accepted/refused
  | "schedule_created" // host scheduled a cleaning
  | "proof_submitted" // cleaner submitted proof
  | "task_completed" // host completed the task
  | "dispute" // cleaner reported a dispute
  | "message" // new chat message
  | "general";

export interface INotification extends Document {
  user: Types.ObjectId; // recipient
  title: string;
  message: string;
  type: TNotificationType;
  data?: Record<string, unknown>; // extra payload (ids, etc.)
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}
