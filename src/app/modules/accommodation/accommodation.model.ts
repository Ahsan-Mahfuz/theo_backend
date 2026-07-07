import { Schema, model } from "mongoose";
import { ACCOMMODATION_TYPES, IAccommodation } from "./accommodation.interface";

const accommodationSchema = new Schema<IAccommodation>(
  {
    // ─── Step 1: General Information ──────────────────────────────────────────
    name: { type: String, required: true, trim: true },
    accommodationType: {
      type: String,
      enum: ACCOMMODATION_TYPES,
      required: true,
    },
    address: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true },

    // ─── Step 2: Accommodation Details ────────────────────────────────────────
    floor: { type: String },
    doorCode: { type: String },
    numberOfRooms: { type: Number, required: true },
    surface: { type: Number, required: true },
    hasElevator: { type: Boolean, default: false },
    cleaningRate: { type: Number, required: true },
    notes: { type: String },

    // ─── Step 3: Photos ───────────────────────────────────────────────────────
    photos: [{ type: String }],

    // ─── Step 4: Practical Information ────────────────────────────────────────
    keys: { type: String },
    accessCode: { type: String },
    instructions: { type: String },
    frequency: { type: String },

    // ─── Meta ─────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["scheduled", "not_scheduled"],
      default: "not_scheduled",
    },
    host: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

export const Accommodation = model<IAccommodation>(
  "Accommodation",
  accommodationSchema,
);
