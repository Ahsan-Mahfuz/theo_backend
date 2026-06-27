import { Schema, model } from "mongoose";
import { IBooking, ICalendarConnection } from "./calendar.interface";

const PLATFORMS = [
  "airbnb",
  "booking",
  "vrbo",
  "expedia",
  "tripadvisor",
  "google",
  "apple",
  "outlook",
  "other",
];

// ─── Calendar connection (one iCal URL) ─────────────────────────────────────────
const connectionSchema = new Schema<ICalendarConnection>(
  {
    accommodation: {
      type: Schema.Types.ObjectId,
      ref: "Accommodation",
      required: true,
      index: true,
    },
    host: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    platform: { type: String, enum: PLATFORMS, default: "other" },
    label: { type: String },
    icalUrl: { type: String, required: true },

    lastSyncedAt: { type: Date },
    lastSyncStatus: { type: String, enum: ["success", "failed"] },
    lastSyncError: { type: String },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const CalendarConnection = model<ICalendarConnection>(
  "CalendarConnection",
  connectionSchema,
);

// ─── Booking (imported reservation) ─────────────────────────────────────────────
const bookingSchema = new Schema<IBooking>(
  {
    accommodation: {
      type: Schema.Types.ObjectId,
      ref: "Accommodation",
      required: true,
      index: true,
    },
    host: { type: Schema.Types.ObjectId, ref: "User", required: true },
    connection: {
      type: Schema.Types.ObjectId,
      ref: "CalendarConnection",
      required: true,
    },
    platform: { type: String, enum: PLATFORMS, default: "other" },

    uid: { type: String, required: true },
    summary: { type: String },
    guestName: { type: String },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    isCancelled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One row per VEVENT per connection — re-sync updates instead of duplicating.
bookingSchema.index({ connection: 1, uid: 1 }, { unique: true });

export const Booking = model<IBooking>("Booking", bookingSchema);
