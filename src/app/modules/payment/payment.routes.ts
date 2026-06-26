import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { PaymentController } from "./payment.controller";
import { onboardSchema, refundSchema } from "./payment.validation";

const router = express.Router();

// NOTE: the Stripe webhook (POST /api/v1/payment/webhook) is wired directly in
// app.ts with express.raw, BEFORE express.json — it is not registered here.

// ─── Cleaner: payout onboarding ───────────────────────────────────────────────

// POST /api/v1/payment/connect/onboard — create/continue Connect onboarding
router.post(
  "/connect/onboard",
  auth("cleaner"),
  validateRequest(onboardSchema),
  PaymentController.createConnectAccount,
);

// GET /api/v1/payment/connect/status — refresh onboarding status
router.get(
  "/connect/status",
  auth("cleaner"),
  PaymentController.getConnectStatus,
);

// ─── Host: pay for an accepted schedule ───────────────────────────────────────

// POST /api/v1/payment/schedule/:scheduleId/pay
router.post(
  "/schedule/:scheduleId/pay",
  auth("admin", "host"),
  PaymentController.payForSchedule,
);

// ─── Listings ─────────────────────────────────────────────────────────────────

// GET /api/v1/payment/my — host/cleaner: my payments (?status&page&limit)
router.get("/my", auth("host", "cleaner"), PaymentController.listMyPayments);

// GET /api/v1/payment — admin: all payments
router.get("/", auth("admin"), PaymentController.listAllPayments);

// POST /api/v1/payment/schedule/:scheduleId/release — admin: retry a failed payout
router.post(
  "/schedule/:scheduleId/release",
  auth("admin"),
  PaymentController.retryRelease,
);

// POST /api/v1/payment/:id/refund — admin: refund a held payment
router.post(
  "/:id/refund",
  auth("admin"),
  validateRequest(refundSchema),
  PaymentController.refundPayment,
);

export const PaymentRoutes = router;
