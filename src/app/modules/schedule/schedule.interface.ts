import { Document, Types } from "mongoose";

export type TScheduleStatus =
  | "scheduled" // host created the schedule, sent to cleaner (awaiting response)
  | "accepted" // cleaner accepted — host can now pay
  | "refused" // cleaner refused the schedule
  | "in_progress" // cleaner started
  | "proof_submitted" // cleaner submitted proof, awaiting host
  | "completed" // host accepted / task done
  | "disputed" // cleaner raised a dispute
  | "cancelled";

export type TPaymentStatus = "unpaid" | "paid_held" | "released" | "refunded";

export interface IDispute {
  reason?: string;
  notes?: string;
  photos: string[];
  raisedAt: Date;
}

export interface ICleaningSchedule extends Document {
  accommodation: Types.ObjectId;
  host: Types.ObjectId;
  cleaner: Types.ObjectId; // accepted primary cleaner
  assignment: Types.ObjectId; // the CleanerAssignment used

  date: Date;
  checkInTime: string; // "10:00"
  checkOutTime: string; // "14:00"
  notes?: string; // host instructions for this job

  status: TScheduleStatus;
  paymentStatus: TPaymentStatus;

  // proof of completion (from the cleaner's checklist screen)
  proofPhotos: string[];
  proofNotes?: string;
  proofSubmittedAt?: Date;

  dispute?: IDispute;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
