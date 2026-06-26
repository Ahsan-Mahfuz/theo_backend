/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { PaymentService } from "./payment.service";

// ─── Cleaner: Connect onboarding ──────────────────────────────────────────────

const createConnectAccount = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await PaymentService.createConnectAccount(
    cleanerId,
    req.body.country,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Open the URL to finish setting up payouts",
    data: result,
  });
});

const getConnectStatus = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await PaymentService.refreshConnectStatus(cleanerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Connect status retrieved",
    data: result,
  });
});

// ─── Host: pay for a schedule ─────────────────────────────────────────────────

const payForSchedule = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await PaymentService.payForSchedule(
    hostId,
    req.params.scheduleId,
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Payment intent created",
    data: result,
  });
});

// ─── Listings ─────────────────────────────────────────────────────────────────

const listMyPayments = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const role = (req as any).user.role;
  const result = await PaymentService.listMyPayments(
    userId,
    role,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payments retrieved successfully",
    data: result,
  });
});

const listAllPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.listAllPayments(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payments retrieved successfully",
    data: result,
  });
});

const refundPayment = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.refundPayment(
    req.params.id,
    req.body.reason,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment refunded successfully",
    data: result,
  });
});

// Admin: retry the payout if the auto-release at completion failed.
// Surfaces the real Stripe error (not swallowed) so the cause is visible.
const retryRelease = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.releaseForSchedule(
    req.params.scheduleId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.released
      ? "Payout released to the cleaner"
      : "No held payment to release for this schedule",
    data: result,
  });
});

// ─── Stripe webhook (raw body; mounted before express.json in app.ts) ─────────
// Not wrapped in catchAsync/sendResponse — Stripe expects a fast 200/400.
const webhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  try {
    await PaymentService.handleWebhook(req.body as Buffer, signature);
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("⚠️ Stripe webhook error:", err?.message);
    res.status(400).json({ error: `Webhook Error: ${err?.message}` });
  }
};

export const PaymentController = {
  createConnectAccount,
  getConnectStatus,
  payForSchedule,
  listMyPayments,
  listAllPayments,
  refundPayment,
  retryRelease,
  webhook,
};
