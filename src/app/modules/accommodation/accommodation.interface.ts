import { Document, Types } from "mongoose";

export type TAccommodationStatus = "scheduled" | "not_scheduled";

export interface IAccommodation extends Document {
  // ─── Step 1: General Information ────────────────────────────────────────────
  name: string;
  accommodationType: string; // Apartment, House, Studio, etc.
  address: string;
  city: string;
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
