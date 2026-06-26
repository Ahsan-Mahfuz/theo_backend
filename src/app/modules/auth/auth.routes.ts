import express from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { auth } from "../../middleware/auth";
import { AuthController } from "./auth.controller";
import {
  signUpSchema,
  verifyOtpSchema,
  completeProfileSchema,
  selectRoleSchema,
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  deleteAccountSchema,
} from "./auth.validation";
import { upload } from "../../middleware/multer";

const router = express.Router();

// ─── Sign Up Flow ─────────────────────────────────────────────────────────────

router.post(
  "/signup",
  validateRequest(signUpSchema),
  AuthController.signUp,
);

router.post(
  "/verify-otp",
  validateRequest(verifyOtpSchema),
  AuthController.verifyOtp,
);

router.post(
  "/complete-profile",
  auth(), // authenticated only — runs during onboarding before a role is set
  validateRequest(completeProfileSchema),
  AuthController.completeProfile,
);

router.post(
  "/select-role",
  auth(), // authenticated only — user has no role yet at this point
  validateRequest(selectRoleSchema),
  AuthController.selectRole,
);

router.post("/resend-otp", AuthController.resendOtp);

// ─── Sign-in ─────────────────────────────────────────────────────────────────

router.post("/signin", validateRequest(signInSchema), AuthController.signIn);

// ─── Forgot / Reset password ──────────────────────────────────────────────────

router.post(
  "/forgot-password",
  validateRequest(forgotPasswordSchema),
  AuthController.forgotPassword,
);

router.post(
  "/verify-reset-otp",
  validateRequest(verifyOtpSchema),
  AuthController.verifyResetOtp,
);

router.post(
  "/reset-password",
  validateRequest(resetPasswordSchema),
  AuthController.resetPassword,
);

// ─── Protected routes ─────────────────────────────────────────────────────────

router.post(
  "/change-password",
  auth("admin", "host", "cleaner"),
  validateRequest(changePasswordSchema),
  AuthController.changePassword,
);

router.get(
  "/me",
  auth("admin", "host", "cleaner"),
  AuthController.getMyProfile,
);

router.patch(
  "/update-me",
  auth("admin", "host", "cleaner"),
  upload.single("profileImage"),
  validateRequest(updateProfileSchema),
  AuthController.updateMyProfile,
);

router.delete(
  "/delete-me",
  auth("admin", "host", "cleaner"),
  validateRequest(deleteAccountSchema),
  AuthController.deleteMyAccount,
);

export const AuthRoutes = router;
