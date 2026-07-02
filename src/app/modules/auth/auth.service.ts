/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User } from "../user/user.model";
import AppError from "../../error/appError";
import { generateOtp } from "../../utilities/generateOtp";
import sendEmail from "../../utilities/sendEmail";
import config from "../../config";
import {
  ITokenPayload,
  ISignUp,
  ICompleteProfile,
  ISignIn,
  IForgotPassword,
  IVerifyOtp,
  IResetPassword,
  IChangePassword,
  IUpdateProfile,
  IDeleteAccount,
} from "./auth.interface";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const signToken = (payload: ITokenPayload): string => {
  return jwt.sign(payload, config.jwt_access_secret as string, {
    expiresIn: config.jwt_access_expires_in as any,
  });
};

// All profile fields returned to the client. Any field missing on the document
// is filled with `null` so host & cleaner responses always have the same shape.
const PROFILE_FIELDS: string[] = [
  "firstName",
  "lastName",
  "name",
  "email",
  "role",
  "authProvider",
  "phone",
  "profileImage",
  // host address
  "address",
  "city",
  "zipCode",
  "country",
  // cleaner profile
  "about",
  "biography",
  "interventionZone",
  "languages",
  "servicesOffered",
  "cleaningsCompleted",
  // cleaner onboarding / professional status
  "siretNumber",
  "isProfessionalVerified",
  "workCity",
  "serviceRadius",
  "licenseNumber",
  "availability",
  "kycLevel",
  // push / stripe
  "playerId",
  "stripeAccountId",
  "stripeCustomerId",
  "stripeOnboardingComplete",
  "payoutsEnabled",
  // status
  "isActive",
  "isVerified",
  "isDeleted",
];

const sanitize = (user: any) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.otp;
  delete obj.otpExpiry;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpiry;

  // Ensure every profile field is present (null when unset) for a consistent
  // response shape across host & cleaner.
  for (const field of PROFILE_FIELDS) {
    if (obj[field] === undefined) obj[field] = null;
  }

  // Cleaner-only: has the cleaner finished the onboarding (setup profile) screens?
  // Required fields collected during onboarding (biography & photo are optional).
  if (obj.role === "cleaner") {
    obj.isOnboardingComplete = Boolean(
      obj.siretNumber &&
        obj.workCity &&
        obj.serviceRadius &&
        obj.licenseNumber &&
        obj.availability,
    );
  }

  return obj;
};

// ─── Sign Up Flow ─────────────────────────────────────────────────────────────

const signUp = async (payload: ISignUp) => {
  const existing = await User.findOne({ email: payload.email });
  if (existing && existing.isDeleted) {
    throw new AppError(409, "This email is associated with a deleted account.");
  }
  if (existing && existing.isVerified) {
    throw new AppError(409, "Email is already registered and verified");
  }

  const otp = generateOtp(); // default 6 digit for Gestlio
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  console.log(`OTP for ${payload.email}: ${otp}`);

  if (existing) {
    existing.otp = otp;
    existing.otpExpiry = otpExpiry;
    await existing.save();
  } else {
    await User.create({
      email: payload.email,
      // no default role — user must choose via selectRole
      otp,
      otpExpiry,
      isActive: true,
      isVerified: false,
    });
  }

  await sendEmail({
    email: payload.email,
    subject: "Gestlio – Email Verification",
    html: `
      <h2>Verify Your Email</h2>
      <p>Use the OTP below to verify your account. It expires in <strong>10 minutes</strong>.</p>
      <h1 style="letter-spacing:8px; color:#1E90FF;">${otp}</h1>
    `,
  });

  return { message: "OTP sent to your email" };
};

const verifyOtp = async (payload: IVerifyOtp) => {
  const user = await User.findOne({ email: payload.email }).select(
    "+otp +otpExpiry",
  );
  if (!user) throw new AppError(404, "User not found");
  if (!user.otp || !user.otpExpiry)
    throw new AppError(400, "No OTP found, request a new one");
  if (user.otp !== payload.otp) throw new AppError(400, "Invalid OTP");
  if (user.otpExpiry < new Date()) throw new AppError(400, "OTP has expired");

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpiry = undefined;
  await user.save();

  const token = signToken({
    userId: String(user._id),
    role: user.role,
    email: user.email,
  });

  return { token, user: sanitize(user) };
};

const completeProfile = async (
  userId: string,
  payload: ICompleteProfile,
) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, "User not found");

  user.firstName = payload.firstName;
  user.lastName = payload.lastName;
  user.name = `${payload.firstName} ${payload.lastName}`;
  if (payload.password) {
    user.password = payload.password; // will be hashed in pre-save hook
  }

  await user.save();

  return sanitize(user);
};

const selectRole = async (userId: string, role: "host" | "cleaner") => {
  const user = await User.findByIdAndUpdate(userId, { role }, { new: true });
  if (!user) throw new AppError(404, "User not found");
  return sanitize(user);
};

const resendOtp = async (email: string) => {
  const user = await User.findOne({ email });
  if (!user) throw new AppError(404, "No account found with this email");

  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await User.findByIdAndUpdate(user._id, { otp, otpExpiry });

  await sendEmail({
    email: user.email,
    subject: "Gestlio – Resend OTP",
    html: `
      <h2>Your New OTP</h2>
      <p>Use the OTP below. It expires in <strong>10 minutes</strong>.</p>
      <h1 style="letter-spacing:8px; color:#1E90FF;">${otp}</h1>
    `,
  });

  return { message: "OTP resent to your email" };
};

// ─── Sign-in ───────────────────────────────────────────────────────────
const signIn = async (payload: ISignIn) => {
  const user = await User.findOne({ email: payload.email }).select("+password");
  if (!user) throw new AppError(401, "Invalid email or password");
  if (user.isDeleted) throw new AppError(403, "This account has been deleted.");
  if (!user.isVerified)
    throw new AppError(
      403,
      "Your account is not verified. Please verify your email.",
    );

  const isMatch = await user.matchPassword(payload.password);
  if (!isMatch) throw new AppError(401, "Invalid email or password");

  const token = signToken({
    userId: String(user._id),
    role: user.role,
    email: user.email,
  });

  return { token, user: sanitize(user) };
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
const forgotPassword = async (payload: IForgotPassword) => {
  const user = await User.findOne({ email: payload.email });
  if (!user) throw new AppError(404, "No account found with this email");

  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await User.findByIdAndUpdate(user._id, { otp, otpExpiry });

  await sendEmail({
    email: user.email,
    subject: "Gestlio – Password Reset OTP",
    html: `
      <h2>Password Reset Request</h2>
      <p>Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
      <h1 style="letter-spacing:8px; color:#1E90FF;">${otp}</h1>
    `,
  });

  return { message: "OTP sent to your email" };
};

const verifyResetOtp = async (payload: IVerifyOtp) => {
  const user = await User.findOne({ email: payload.email }).select(
    "+otp +otpExpiry",
  );
  if (!user) throw new AppError(404, "User not found");
  if (!user.otp || !user.otpExpiry)
    throw new AppError(400, "No OTP found, request a new one");
  if (user.otp !== payload.otp) throw new AppError(400, "Invalid OTP");
  if (user.otpExpiry < new Date()) throw new AppError(400, "OTP has expired");

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await User.findByIdAndUpdate(user._id, {
    otp: undefined,
    otpExpiry: undefined,
    passwordResetToken: resetToken,
    passwordResetExpiry: resetExpiry,
  });

  return { resetToken };
};

const resetPassword = async (payload: IResetPassword) => {
  const user = await User.findOne({ email: payload.email }).select(
    "+passwordResetToken +passwordResetExpiry",
  );
  if (!user) throw new AppError(404, "User not found");
  if (!user.passwordResetToken || !user.passwordResetExpiry)
    throw new AppError(400, "Reset token not found, please request again");
  if (user.passwordResetExpiry < new Date())
    throw new AppError(400, "Reset token has expired");

  user.password = payload.newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  await user.save();

  return { message: "Password reset successfully" };
};

// ─── Change Password ──────────────────────────────────────────────
const changePassword = async (userId: string, payload: IChangePassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new AppError(404, "User not found");

  const isMatch = await user.matchPassword(payload.currentPassword);
  if (!isMatch) throw new AppError(400, "Current password is incorrect");

  user.password = payload.newPassword;
  await user.save();

  return { message: "Password changed successfully" };
};

// ─── Profile ───────────────────────────────────────────────────────────
const getMyProfile = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, "User not found");
  return sanitize(user);
};

const updateMyProfile = async (userId: string, payload: IUpdateProfile) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (payload.firstName !== undefined) updateData.firstName = payload.firstName;
  if (payload.lastName !== undefined) updateData.lastName = payload.lastName;
  if (payload.phone !== undefined) updateData.phone = payload.phone;
  if (payload.profileImage !== undefined)
    updateData.profileImage = payload.profileImage;
  if (payload.address !== undefined) updateData.address = payload.address;
  if (payload.city !== undefined) updateData.city = payload.city;
  if (payload.zipCode !== undefined) updateData.zipCode = payload.zipCode;
  if (payload.country !== undefined) updateData.country = payload.country;
  if (payload.about !== undefined) updateData.about = payload.about;
  if (payload.biography !== undefined) updateData.biography = payload.biography;
  if (payload.interventionZone !== undefined)
    updateData.interventionZone = payload.interventionZone;
  if (payload.languages !== undefined) updateData.languages = payload.languages;
  if (payload.servicesOffered !== undefined)
    updateData.servicesOffered = payload.servicesOffered;
  if (payload.workCity !== undefined) updateData.workCity = payload.workCity;
  if (payload.serviceRadius !== undefined)
    updateData.serviceRadius = payload.serviceRadius;
  if (payload.licenseNumber !== undefined)
    updateData.licenseNumber = payload.licenseNumber;
  if (payload.availability !== undefined)
    updateData.availability = payload.availability;
  if (payload.playerId !== undefined) updateData.playerId = payload.playerId;

  // SIRET submission marks the professional status as verified (KYC level 1)
  if (payload.siretNumber !== undefined) {
    updateData.siretNumber = payload.siretNumber;
    updateData.isProfessionalVerified = true;
    updateData.kycLevel = 1;
  }

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  });
  if (!user) throw new AppError(404, "User not found");
  return sanitize(user);
};

const deleteMyAccount = async (userId: string, payload: IDeleteAccount) => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new AppError(404, "User not found");

  const isMatch = await user.matchPassword(payload.password);
  if (!isMatch) throw new AppError(400, "Password is incorrect");

  // Soft delete
  user.isDeleted = true;
  user.isActive = false;
  await user.save();

  return { message: "Account deleted successfully" };
};

export const AuthService = {
  signUp,
  verifyOtp,
  completeProfile,
  selectRole,
  resendOtp,
  signIn,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  changePassword,
  getMyProfile,
  updateMyProfile,
  deleteMyAccount,
};
