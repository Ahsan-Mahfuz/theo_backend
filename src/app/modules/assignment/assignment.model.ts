import { Schema, model } from "mongoose";
import { ICleanerAssignment } from "./assignment.interface";

const assignmentSchema = new Schema<ICleanerAssignment>(
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
    role: {
      type: String,
      enum: ["primary", "substitute"],
      default: "substitute",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "refused"],
      default: "pending",
    },
    pricePerCleaning: { type: Number },
    message: { type: String },
    respondedAt: { type: Date },
  },
  { timestamps: true },
);

// one cleaner can be assigned to an accommodation only once
assignmentSchema.index({ accommodation: 1, cleaner: 1 }, { unique: true });

export const CleanerAssignment = model<ICleanerAssignment>(
  "CleanerAssignment",
  assignmentSchema,
);
