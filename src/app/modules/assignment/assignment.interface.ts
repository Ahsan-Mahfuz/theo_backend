import { Document, Types } from "mongoose";

export type TAssignmentRole = "primary" | "substitute";
export type TAssignmentStatus = "pending" | "accepted" | "refused";

export interface ICleanerAssignment extends Document {
  accommodation: Types.ObjectId;
  host: Types.ObjectId;
  cleaner: Types.ObjectId;
  role: TAssignmentRole;
  status: TAssignmentStatus;
  pricePerCleaning?: number; // shown on the request card
  message?: string; // host's note, e.g. "Looking for a trustworthy person"
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
