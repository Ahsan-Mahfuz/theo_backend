import { Document, Types } from "mongoose";

// iCal is a standard format; we keep an explicit list so the frontend can show
// a per-platform icon. "other" is the fallback for any other iCal source
// (Lodgify, Smoobu, Guesty, etc.).
export type TPlatform =
  | "airbnb"
  | "booking"
  | "vrbo"
  | "expedia"
  | "tripadvisor"
  | "google"
  | "apple"
  | "outlook"
  | "other";

export type TSyncStatus = "success" | "failed";

// One iCal URL the host pasted for an accommodation.
export interface ICalendarConnection extends Document {
  accommodation: Types.ObjectId;
  host: Types.ObjectId;
  platform: TPlatform;
  label?: string;
  icalUrl: string;

  lastSyncedAt?: Date;
  lastSyncStatus?: TSyncStatus;
  lastSyncError?: string;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// One reservation imported from an iCal feed.
export interface IBooking extends Document {
  accommodation: Types.ObjectId;
  host: Types.ObjectId;
  connection: Types.ObjectId;
  platform: TPlatform;

  uid: string; // iCal VEVENT UID — used to upsert/dedupe
  summary?: string;
  guestName?: string;

  startDate: Date; // check-in
  endDate: Date; // check-out

  isCancelled: boolean; // flagged when it disappears from the feed

  createdAt: Date;
  updatedAt: Date;
}
