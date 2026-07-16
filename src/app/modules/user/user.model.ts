import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";
import config from "../../config";
import { IUser } from "./user.interface";

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, select: false },

    role: { type: String, enum: ["admin", "host", "cleaner"] },
    isSuperAdmin: { type: Boolean, default: false }, // super admin — role stays "admin"
    authProvider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },

    phone: { type: String },
    profileImage: { type: String },

    // ─── Host address ─────────────────────────────────────────────────────────
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    zipCode: { type: String, trim: true },

    // ─── Cleaner (housekeeper) profile ────────────────────────────────────────
    about: { type: String },
    biography: { type: String },
    interventionZone: { type: String },
    languages: [{ type: String }],
    servicesOffered: [{ type: String }],
    cleaningsCompleted: { type: Number, default: 0 },

    // ─── Cleaner onboarding / professional status ─────────────────────────────
    siretNumber: { type: String },
    isProfessionalVerified: { type: Boolean, default: false },
    workCity: { type: String },
    serviceRadius: { type: Number },
    licenseNumber: { type: String },
    availability: {
      type: String,
      enum: ["full_time", "part_time", "flexible"],
    },
    kycLevel: { type: Number, default: 0 },

    // ─── Push notification (OneSignal) ────────────────────────────────────────
    playerId: { type: String },

    // ─── Stripe ───────────────────────────────────────────────────────────────
    country: { type: String }, // ISO-2 for the cleaner's connected account
    stripeAccountId: { type: String },
    stripeCustomerId: { type: String },
    stripeOnboardingComplete: { type: Boolean, default: false },
    payoutsEnabled: { type: Boolean, default: false },

    // The user's OWN visibility switch, not a block. A cleaner turns this off to
    // keep their profile out of the host's "Find a housekeeper" search; they can
    // still sign in and use every feature. Never gate auth on this.
    isActive: { type: Boolean, default: true },
    // Set by an admin only (block/unblock). This is the flag that locks a user
    // out of the API — see the auth middleware.
    isBlocked: { type: Boolean, default: false, index: true },
    isVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },

    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpiry: { type: Date, select: false },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }
  this.password = await bcrypt.hash(
    this.password,
    Number(config.bcrypt_salt_rounds),
  );
  next();
});

userSchema.methods.matchPassword = async function (plain: string) {
  if (!this.password) return false;
  return await bcrypt.compare(plain, this.password);
};

export const User = model<IUser>("User", userSchema);
