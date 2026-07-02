import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[@#!%*?&]/, "Password must contain at least one special character");

// ─── Sign Up Flow ─────────────────────────────────────────────────────────────

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  otp: z.string().length(4, "OTP must be 4 digits"), // Based on image 6-digit code
});

export const completeProfileSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    password: passwordSchema,
  });

export const selectRoleSchema = z.object({
  role: z.enum(["host", "cleaner"]),
});

// ─── Sign-in ─────────────────────────────────────────────────────────────────

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ─── Forgot password ─────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
});

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ─── Change password (logged in) ─────────────────────────────────────────────

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// multipart sends arrays either as repeated keys (-> array) or as a comma
// separated string; coerce both to string[]
const toStringArray = (v: unknown) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return v;
};

const toNum = (v: unknown) => (typeof v === "string" && v !== "" ? Number(v) : v);

export const updateProfileSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  // host address fields
  address: z.string().optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  // cleaner profile fields
  about: z.string().optional(),
  biography: z.string().optional(),
  interventionZone: z.string().optional(),
  languages: z.preprocess(toStringArray, z.array(z.string())).optional(),
  servicesOffered: z.preprocess(toStringArray, z.array(z.string())).optional(),
  // cleaner onboarding / professional status
  siretNumber: z
    .string()
    .regex(/^\d{14}$/, "SIRET number must be exactly 14 digits")
    .optional(),
  workCity: z.string().optional(),
  serviceRadius: z.preprocess(toNum, z.number().min(1).max(100)).optional(),
  licenseNumber: z.string().optional(),
  availability: z.enum(["full_time", "part_time", "flexible"]).optional(),
  // push registration
  playerId: z.string().optional(),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
