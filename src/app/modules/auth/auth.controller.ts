/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";

// ─── Sign Up Flow ─────────────────────────────────────────────────────────────

const signUp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.signUp(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.verifyOtp(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Email verified successfully",
    token: result.token,
    data: result.user,
  });
});

const completeProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await AuthService.completeProfile(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile completed successfully",
    data: result,
  });
});

const selectRole = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await AuthService.selectRole(userId, req.body.role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Role selected successfully",
    data: result,
  });
});

const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.resendOtp(req.body.email);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// ─── Sign-in ─────────────────────────────────────────────────────────────────

const signIn = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.signIn(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Signed in successfully",
    token: result.token,
    data: result.user,
  });
});

// ─── Forgot / Reset password ──────────────────────────────────────────────────

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.forgotPassword(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const verifyResetOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.verifyResetOtp(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "OTP verified successfully",
    data: result,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.resetPassword(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// ─── Change password (logged in) ──────────────────────────────────────────────

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await AuthService.changePassword(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// ─── Get my profile ───────────────────────────────────────────────────────────

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await AuthService.getMyProfile(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile retrieved successfully",
    data: result,
  });
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;

  const payload: any = { ...req.body };
  if (req.file) {
    payload.profileImage = `/uploads/profiles/${req.file.filename}`;
  }

  const result = await AuthService.updateMyProfile(userId, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

const deleteMyAccount = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await AuthService.deleteMyAccount(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const AuthController = {
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
