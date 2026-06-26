import { Document, Types } from "mongoose";

export type TRole = "admin" | "host" | "cleaner";
export type TAuthProvider = "local" | "google" | "apple";
export type TAvailability = "full_time" | "part_time" | "flexible";

export interface IUser extends Document {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  name?: string; // computed or combined
  email: string;
  password?: string;
  role?: TRole;
  authProvider: TAuthProvider;
  phone?: string;
  profileImage?: string;

  // ─── Cleaner (housekeeper) profile ──────────────────────────────────────────
  about?: string;
  biography?: string; // "Tell us a little bit about yourself" (setup profile)
  interventionZone?: string; // e.g. "Paris 11th and surroundings"
  languages?: string[]; // e.g. ["French", "English"]
  servicesOffered?: string[]; // e.g. ["Ironing of laundry", "Window cleaning"]
  cleaningsCompleted?: number; // counter shown on the profile

  // ─── Cleaner onboarding / professional status ───────────────────────────────
  siretNumber?: string; // 14-digit self-employed registration number
  isProfessionalVerified?: boolean; // verified professional status
  workCity?: string; // "Your city" — main city
  serviceRadius?: number; // service area radius in km
  licenseNumber?: string; // identification / licence number
  availability?: TAvailability; // full_time / part_time / flexible
  kycLevel?: number; // KYC verification level (0 = none, 1 = level 1)

  // ─── Push notification (OneSignal) ──────────────────────────────────────────
  playerId?: string;

  // ─── Stripe ─────────────────────────────────────────────────────────────────
  country?: string; // ISO-2 (e.g. "US", "FR") — used for the cleaner's connected account
  stripeAccountId?: string; // cleaner's Connect Express account (acct_...)
  stripeCustomerId?: string; // host's Stripe customer (cus_...)
  stripeOnboardingComplete?: boolean; // cleaner finished Connect onboarding
  payoutsEnabled?: boolean; // cleaner can receive payouts

  isActive: boolean;
  isVerified: boolean; // email verified status
  isDeleted: boolean; // soft delete status

  // OTP / password reset
  otp?: string;
  otpExpiry?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;

  createdAt: Date;
  updatedAt: Date;

  matchPassword(plain: string): Promise<boolean>;
}
