import { Document, Types } from "mongoose";

export type TAccommodationStatus = "scheduled" | "not_scheduled";

export type TAccommodationType = "House" | "Apartment" | "Studio" | "Other";

export const ACCOMMODATION_TYPES: TAccommodationType[] = [
  "House",
  "Apartment",
  "Studio",
  "Other",
];

export interface IAccommodation extends Document {
  // ─── Step 1: General Information ────────────────────────────────────────────
  name: string;
  accommodationType: TAccommodationType;
  address: string;
  city: string; // free text
  zipCode: string;

  // ─── Step 2: Accommodation Details ──────────────────────────────────────────
  floor?: string;
  doorCode?: string;
  numberOfRooms: number;
  surface: number; // in m²
  hasElevator: boolean;
  cleaningRate: number; // in €
  notes?: string;

  // ─── Step 3: Photos ─────────────────────────────────────────────────────────
  photos: string[];

  // ─── Step 4: Practical Information ──────────────────────────────────────────
  keys?: string;
  accessCode?: string;
  instructions?: string;
  frequency?: string;

  // ─── Meta ───────────────────────────────────────────────────────────────────
  status: TAccommodationStatus;
  host: Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
