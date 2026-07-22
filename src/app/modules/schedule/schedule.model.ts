import { Schema, model } from "mongoose";
import { ICleaningSchedule } from "./schedule.interface";

const disputeSchema = new Schema(
  {
    reason: { type: String },
    notes: { type: String },
    photos: [{ type: String }],
    raisedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const scheduleSchema = new Schema<ICleaningSchedule>(
  {
    accommodation: {
      type: Schema.Types.ObjectId,
      ref: "Accommodation",
      required: true,
      index: true,
    },
    host: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cleaner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignment: { type: Schema.Types.ObjectId, ref: "CleanerAssignment", required: true },

    // optional link to an imported iCal booking this cleaning is for
    booking: { type: Schema.Types.ObjectId, ref: "Booking", index: true },

    date: { type: Date, required: true },
    checkInTime: { type: String, required: true },
    checkOutTime: { type: String, required: true },
    notes: { type: String },

    status: {
      type: String,
      enum: [
        "scheduled",
        "accepted",
        "refused",
        "in_progress",
        "proof_submitted",
        "completed",
        "disputed",
        "cancelled",
      ],
      default: "scheduled",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid_held", "released", "refunded", "handcash_pending", "paid_handcash"],
      default: "unpaid",
      index: true,
    },

    // set when the cleaner refuses this schedule
    refusedAt: { type: Date },

    proofPhotos: [{ type: String }],
    proofNotes: { type: String },
    proofSubmittedAt: { type: Date },

    dispute: { type: disputeSchema },
    completedAt: { type: Date },

    // host rejected the submitted proof (sent back to the cleaner to redo)
    invalidationReason: { type: String },
    invalidatedAt: { type: Date },
    invalidationCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const CleaningSchedule = model<ICleaningSchedule>(
  "CleaningSchedule",
  scheduleSchema,
);
