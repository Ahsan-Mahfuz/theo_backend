import { TRole } from "../user/user.interface";

export interface ITokenPayload {
  userId: string;
  role?: TRole;
  email: string;
}

// ─── Sign Up Flow ─────────────────────────────────────────────────────────────

export interface ISignUp {
  email: string;
}

export interface IVerifyOtp {
  email: string;
  otp: string;
}

export interface ICompleteProfile {
  firstName: string;
  lastName: string;
  password?: string;
  confirmPassword?: string;
}

export interface ISelectRole {
  role: TRole;
}

// ─── Shared ───────────────────────────────────────────────────────────────────

export interface ISignIn {
  email: string;
  password: string;
}

export interface IForgotPassword {
  email: string;
}

export interface IResetPassword {
  email: string;
  newPassword: string;
  confirmPassword: string;
}

export interface IChangePassword {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface IUpdateProfile {
  firstName?: string;
  lastName?: string;
  phone?: string;
  profileImage?: string;
  // host address
  address?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  about?: string;
  biography?: string;
  interventionZone?: string;
  languages?: string[];
  servicesOffered?: string[];
  siretNumber?: string;
  workCity?: string;
  serviceRadius?: number;
  licenseNumber?: string;
  availability?: "full_time" | "part_time" | "flexible";
  playerId?: string;
}

export interface IDeleteAccount {
  password: string;
}
