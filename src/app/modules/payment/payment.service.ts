/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { Payment } from "./payment.model";
import { stripe, PINNED_API_VERSION } from "../../utilities/stripe";
import config from "../../config";
import AppError from "../../error/appError";
import { User } from "../user/user.model";
import { CleaningSchedule } from "../schedule/schedule.model";
import { Accommodation } from "../accommodation/accommodation.model";
import { CleanerAssignment } from "../assignment/assignment.model";
import { NotificationService } from "../notification/notification.service";

const CURRENCY = config.platform_currency || "usd";
const FEE_PERCENT = config.platform_fee_percent || 5;

const returnUrl =
  config.stripe_connect_return_url ||
  `${config.frontend_url}/stripe/connect/return`;
const refreshUrl =
  config.stripe_connect_refresh_url ||
  `${config.frontend_url}/stripe/connect/refresh`;

// ─── Cleaner: create / continue Connect onboarding ────────────────────────────
const createConnectAccount = async (cleanerId: string, country?: string) => {
  const cleaner = await User.findById(cleanerId);
  if (!cleaner) throw new AppError(404, "Cleaner not found");
  if (cleaner.role !== "cleaner") {
    throw new AppError(403, "Only cleaners can set up payouts");
  }

  let accountId = cleaner.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: country || cleaner.country || undefined,
      email: cleaner.email,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { userId: String(cleaner._id) },
    });
    accountId = account.id;
    cleaner.stripeAccountId = accountId;
    if (country) cleaner.country = country;
    await cleaner.save();
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return { url: accountLink.url, accountId };
};

// ─── Cleaner: refresh onboarding status from Stripe ───────────────────────────
const refreshConnectStatus = async (cleanerId: string) => {
  const cleaner = await User.findById(cleanerId);
  if (!cleaner) throw new AppError(404, "Cleaner not found");
  if (!cleaner.stripeAccountId) {
    return {
      onboarded: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      message: "Not started",
    };
  }

  const account = await stripe.accounts.retrieve(cleaner.stripeAccountId);
  cleaner.payoutsEnabled = !!account.payouts_enabled;
  cleaner.stripeOnboardingComplete =
    !!account.details_submitted && !!account.payouts_enabled;
  await cleaner.save();

  return {
    onboarded: cleaner.stripeOnboardingComplete,
    payoutsEnabled: cleaner.payoutsEnabled,
    detailsSubmitted: !!account.details_submitted,
  };
};

// ─── Host: pay for an accepted schedule (escrow hold) ─────────────────────────
const payForSchedule = async (hostId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  });
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (schedule.status !== "accepted") {
    throw new AppError(
      400,
      "You can only pay once the cleaner has accepted the schedule.",
    );
  }
  if (schedule.paymentStatus === "paid_held" || schedule.paymentStatus === "released") {
    throw new AppError(400, "This schedule is already paid.");
  }

  const cleaner = await User.findById(schedule.cleaner);
  if (!cleaner) throw new AppError(404, "Cleaner not found");
  if (!cleaner.payoutsEnabled || !cleaner.stripeAccountId) {
    throw new AppError(
      400,
      "The cleaner has not finished setting up payouts yet.",
    );
  }

  const accommodation = await Accommodation.findById(schedule.accommodation);
  if (!accommodation) throw new AppError(404, "Accommodation not found");

  // Charge the price agreed with this cleaner (assignment.pricePerCleaning),
  // falling back to the accommodation's default cleaning rate.
  const assignment = await CleanerAssignment.findById(schedule.assignment);
  const unitPrice = assignment?.pricePerCleaning ?? accommodation.cleaningRate ?? 0;

  const amount = Math.round((unitPrice || 0) * 100);
  if (amount <= 0) throw new AppError(400, "Invalid cleaning rate");
  const platformFee = Math.round((amount * FEE_PERCENT) / 100);
  const cleanerAmount = amount - platformFee;

  // Reuse a pending payment if one already exists (idempotent retry)
  let payment = await Payment.findOne({
    schedule: scheduleId,
    status: "pending",
  });

  const host = await User.findById(hostId);
  if (!host) throw new AppError(404, "Host not found");

  // ensure a Stripe customer for the host
  if (!host.stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: host.email,
      name: host.name || `${host.firstName || ""} ${host.lastName || ""}`.trim(),
      metadata: { userId: String(host._id) },
    });
    host.stripeCustomerId = customer.id;
    await host.save();
  }

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: host.stripeCustomerId },
    { apiVersion: PINNED_API_VERSION },
  );

  if (!payment) {
    payment = await Payment.create({
      schedule: scheduleId,
      host: hostId,
      cleaner: schedule.cleaner,
      accommodation: schedule.accommodation,
      amount,
      currency: CURRENCY,
      platformFee,
      cleanerAmount,
      status: "pending",
    });
  }

  let paymentIntent;
  if (payment.stripePaymentIntentId) {
    paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripePaymentIntentId,
    );
  } else {
    paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: CURRENCY,
      customer: host.stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        scheduleId: String(scheduleId),
        paymentId: String(payment._id),
        hostId: String(hostId),
        cleanerId: String(schedule.cleaner),
      },
    });
    payment.stripePaymentIntentId = paymentIntent.id;
    await payment.save();
  }

  return {
    paymentId: String(payment._id),
    paymentIntentClientSecret: paymentIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customerId: host.stripeCustomerId,
    publishableKey: config.stripe_publishable_key,
    amount,
    currency: CURRENCY,
  };
};

// ─── Stripe webhook handler ───────────────────────────────────────────────────
const handleWebhook = async (rawBody: Buffer, signature: string) => {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.stripe_webhook_secret as string,
  );

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as any;
      const payment = await Payment.findOne({
        $or: [
          { _id: pi.metadata?.paymentId },
          { stripePaymentIntentId: pi.id },
        ],
      });
      if (payment && payment.status === "pending") {
        payment.status = "paid_held";
        payment.stripeChargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id;
        await payment.save();

        // Fund the escrow and move the job into "in_progress" so the cleaner
        // can start. Only advance from "accepted" — never clobber a later state.
        const sched = await CleaningSchedule.findById(payment.schedule);
        if (sched) {
          sched.paymentStatus = "paid_held";
          if (sched.status === "accepted") sched.status = "in_progress";
          await sched.save();
        }

        await NotificationService.createNotification({
          user: String(payment.cleaner),
          title: "Payment received",
          message:
            "The host's payment is secured. You can start the cleaning — you'll be paid on approval.",
          type: "general",
          data: { scheduleId: String(payment.schedule) },
        });

        // admin/super-admin dashboard: a new payment landed in escrow
        await NotificationService.notifyAdmins({
          title: "New payment received",
          message: `A host paid ${(payment.amount / 100).toFixed(2)} ${payment.currency.toUpperCase()} — funds held in escrow.`,
          type: "payment_received",
          data: {
            scheduleId: String(payment.schedule),
            paymentId: String(payment._id),
          },
        });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as any;
      await Payment.findOneAndUpdate(
        { stripePaymentIntentId: pi.id, status: "pending" },
        { status: "failed" },
      );
      break;
    }

    case "account.updated": {
      const account = event.data.object as any;
      const user = await User.findOne({ stripeAccountId: account.id });
      if (user) {
        const wasEnabled = user.payoutsEnabled;
        user.payoutsEnabled = !!account.payouts_enabled;
        user.stripeOnboardingComplete =
          !!account.details_submitted && !!account.payouts_enabled;
        await user.save();

        if (!wasEnabled && user.payoutsEnabled) {
          await NotificationService.createNotification({
            user: String(user._id),
            title: "Payouts enabled",
            message: "Your payout account is ready. You can now receive payments.",
            type: "general",
          });
        }
      }
      break;
    }

    default:
      break;
  }

  return { received: true };
};

// ─── Release funds to the cleaner (called from completeTask) ──────────────────
const releaseForSchedule = async (scheduleId: string) => {
  const payment = await Payment.findOne({
    schedule: scheduleId,
    status: "paid_held",
  });
  if (!payment) return { released: false };
  if (!payment.stripeChargeId) {
    throw new AppError(400, "Charge not settled yet — cannot release payout");
  }

  const cleaner = await User.findById(payment.cleaner);
  if (!cleaner?.stripeAccountId) {
    throw new AppError(400, "Cleaner has no connected account");
  }

  const transfer = await stripe.transfers.create({
    amount: payment.cleanerAmount,
    currency: payment.currency,
    destination: cleaner.stripeAccountId,
    source_transaction: payment.stripeChargeId,
    metadata: {
      scheduleId: String(scheduleId),
      paymentId: String(payment._id),
    },
  });

  payment.status = "released";
  payment.stripeTransferId = transfer.id;
  payment.releasedAt = new Date();
  await payment.save();

  await CleaningSchedule.findByIdAndUpdate(scheduleId, {
    paymentStatus: "released",
  });

  await NotificationService.createNotification({
    user: String(payment.cleaner),
    title: "You've been paid",
    message: `Your payout of ${(payment.cleanerAmount / 100).toFixed(2)} ${payment.currency.toUpperCase()} is on its way.`,
    type: "general",
    data: { scheduleId: String(scheduleId) },
  });

  // admin/super-admin dashboard: funds released from escrow to the cleaner
  await NotificationService.notifyAdmins({
    title: "Payout released",
    message: `${(payment.cleanerAmount / 100).toFixed(2)} ${payment.currency.toUpperCase()} was released to the cleaner.`,
    type: "payment_received",
    data: {
      scheduleId: String(scheduleId),
      paymentId: String(payment._id),
    },
  });

  return { released: true, transferId: transfer.id };
};

// ─── Admin: refund a held payment ─────────────────────────────────────────────
const refundPayment = async (paymentId: string, reason?: string) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new AppError(404, "Payment not found");
  if (payment.status !== "paid_held") {
    throw new AppError(
      400,
      `Only held payments can be refunded here (current: ${payment.status})`,
    );
  }

  const refund = await stripe.refunds.create({
    payment_intent: payment.stripePaymentIntentId as string,
    reason: "requested_by_customer",
    metadata: { reason: reason || "admin refund" },
  });

  payment.status = "refunded";
  payment.stripeRefundId = refund.id;
  await payment.save();

  await CleaningSchedule.findByIdAndUpdate(payment.schedule, {
    paymentStatus: "refunded",
  });

  await NotificationService.createNotification({
    user: String(payment.host),
    title: "Payment refunded",
    message: "Your payment has been refunded.",
    type: "general",
    data: { scheduleId: String(payment.schedule) },
  });

  return payment;
};

// ─── Listings ─────────────────────────────────────────────────────────────────
// aggregate() does NOT auto-cast string ids to ObjectId the way find() does,
// so mirror the filter with the id fields coerced before using it in a pipeline.
const toAggMatch = (filter: any) => {
  const match: any = { ...filter };
  if (typeof match.cleaner === "string") {
    match.cleaner = new Types.ObjectId(match.cleaner);
  }
  if (typeof match.host === "string") {
    match.host = new Types.ObjectId(match.host);
  }
  return match;
};

const buildList = async (filter: any, query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;
  if (query.status) filter.status = query.status;

  const [data, total, summaryAgg] = await Promise.all([
    Payment.find(filter)
      .populate("host", "firstName lastName name email")
      .populate("cleaner", "firstName lastName name email")
      .populate("accommodation", "name address city zipCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
    // Count + total across ALL matching payments (not just this page) so the
    // summary cards reflect the whole dataset, computed on the DB side.
    Payment.aggregate([
      { $match: toAggMatch(filter) },
      { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  const sumCents = summaryAgg[0]?.totalAmount || 0;
  const count = summaryAgg[0]?.count || 0;
  const summary = {
    count,
    totalAmount: toUnits(sumCents),
    averageAmount: count ? toUnits(Math.round(sumCents / count)) : 0,
    currency: CURRENCY,
  };

  return {
    data,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
    summary,
  };
};

const listAllPayments = (query: Record<string, unknown>) => buildList({}, query);

const listMyPayments = (
  userId: string,
  role: string,
  query: Record<string, unknown>,
) => {
  const filter = role === "cleaner" ? { cleaner: userId } : { host: userId };
  return buildList(filter, query);
};

// ─── Revenue dashboard (host = spend, cleaner = earnings) ─────────────────────
// A transaction only counts as revenue once the payment is "released" and the
// funds have actually reached the cleaner's account. "Upcoming" is money still
// held in escrow (paid_held) that will become revenue on release.
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const toUnits = (cents: number) => Math.round((cents || 0)) / 100;

const getRevenue = async (
  userId: string,
  role: string,
  query: Record<string, unknown>,
) => {
  const isCleaner = role === "cleaner";
  // Cleaner sees their payout; host sees what they were charged.
  const amountField = isCleaner ? "$cleanerAmount" : "$amount";
  const base: Record<string, unknown> = isCleaner
    ? { cleaner: new Types.ObjectId(userId) }
    : { host: new Types.ObjectId(userId) };

  const now = new Date();
  const year = query.year ? Number(query.year) : undefined;
  const month = query.month ? Number(query.month) : undefined; // 1-12

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // The month whose total powers the "Revenue this month" card.
  const selYear = year ?? now.getFullYear();
  const selMonth = month ?? now.getMonth() + 1;
  const monthStart = new Date(selYear, selMonth - 1, 1);
  const monthEnd = new Date(selYear, selMonth, 1);

  // Fall back to updatedAt for payments released before releasedAt existed.
  const revAtStage = {
    $addFields: { revAt: { $ifNull: ["$releasedAt", "$updatedAt"] } },
  };

  // ── "This month" released revenue + upcoming (held) funds ──
  const [monthAgg, upcomingAgg] = await Promise.all([
    Payment.aggregate([
      { $match: { ...base, status: "released" } },
      revAtStage,
      { $match: { revAt: { $gte: monthStart, $lt: monthEnd } } },
      { $group: { _id: null, total: { $sum: amountField } } },
    ]),
    Payment.aggregate([
      { $match: { ...base, status: "paid_held" } },
      { $group: { _id: null, total: { $sum: amountField } } },
    ]),
  ]);

  // ── Monthly bar graph ──
  // With a year filter → Jan–Dec of that year; otherwise the trailing 8 months.
  let graphStart: Date;
  let graphEnd: Date;
  if (year) {
    graphStart = new Date(year, 0, 1);
    graphEnd = new Date(year + 1, 0, 1);
  } else {
    graphStart = new Date(now.getFullYear(), now.getMonth() - 7, 1);
    graphEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const graphAgg = await Payment.aggregate([
    { $match: { ...base, status: "released" } },
    revAtStage,
    { $match: { revAt: { $gte: graphStart, $lt: graphEnd } } },
    {
      $group: {
        _id: { y: { $year: "$revAt" }, m: { $month: "$revAt" } },
        total: { $sum: amountField },
      },
    },
  ]);

  const bucketMap = new Map<string, number>();
  for (const g of graphAgg) {
    bucketMap.set(`${g._id.y}-${g._id.m}`, g.total);
  }

  const graph: { year: number; month: number; label: string; total: number }[] = [];
  const cursor = new Date(graphStart);
  while (cursor < graphEnd) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    graph.push({
      year: y,
      month: m,
      label: MONTH_LABELS[cursor.getMonth()],
      total: toUnits(bucketMap.get(`${y}-${m}`) || 0),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // ── Recent transactions (released only) with pagination ──
  const txFilter = { ...base, status: "released" };
  const [txDocs, total] = await Promise.all([
    Payment.find(txFilter)
      .populate("accommodation", "name address city zipCode photos")
      .populate({
        path: "schedule",
        select: "date checkInTime checkOutTime status",
      })
      .sort({ releasedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(txFilter),
  ]);

  const transactions = txDocs.map((p: any) => ({
    _id: String(p._id),
    amount: toUnits(isCleaner ? p.cleanerAmount : p.amount),
    currency: p.currency,
    status: p.status,
    scheduleStatus: p.schedule?.status ?? null,
    date: p.schedule?.date ?? null,
    checkInTime: p.schedule?.checkInTime ?? null,
    checkOutTime: p.schedule?.checkOutTime ?? null,
    accommodation: p.accommodation
      ? {
          _id: String(p.accommodation._id),
          name: p.accommodation.name,
          city: p.accommodation.city,
          address: p.accommodation.address,
          photo: p.accommodation.photos?.[0] ?? null,
        }
      : null,
    releasedAt: p.releasedAt ?? p.updatedAt,
  }));

  return {
    currency: CURRENCY,
    thisMonth: {
      year: selYear,
      month: selMonth,
      revenue: toUnits(monthAgg[0]?.total || 0),
    },
    upcoming: toUnits(upcomingAgg[0]?.total || 0),
    graph,
    transactions,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Single transaction detail (accommodation + schedule + timing) ────────────
const getTransactionDetail = async (
  userId: string,
  role: string,
  paymentId: string,
) => {
  const isCleaner = role === "cleaner";
  const scope: Record<string, unknown> =
    role === "admin"
      ? {}
      : isCleaner
        ? { cleaner: userId }
        : { host: userId };

  const payment = await Payment.findOne({ _id: paymentId, ...scope })
    .populate(
      "accommodation",
      "name address city zipCode photos accommodationType numberOfRooms surface",
    )
    .populate({
      path: "schedule",
      select:
        "date checkInTime checkOutTime status paymentStatus notes proofNotes proofPhotos completedAt",
    })
    .populate("host", "firstName lastName name email phone profileImage")
    .populate("cleaner", "firstName lastName name email phone profileImage")
    .lean();

  if (!payment) throw new AppError(404, "Transaction not found");

  const p = payment as any;
  return {
    _id: String(p._id),
    status: p.status,
    currency: p.currency,
    amount: toUnits(p.amount),
    platformFee: toUnits(p.platformFee),
    cleanerAmount: toUnits(p.cleanerAmount),
    // The amount that matters to the viewer.
    yourAmount: toUnits(isCleaner ? p.cleanerAmount : p.amount),
    releasedAt: p.releasedAt ?? null,
    createdAt: p.createdAt,
    accommodation: p.accommodation ?? null,
    schedule: p.schedule ?? null,
    host: p.host ?? null,
    cleaner: p.cleaner ?? null,
  };
};

export const PaymentService = {
  createConnectAccount,
  refreshConnectStatus,
  payForSchedule,
  handleWebhook,
  releaseForSchedule,
  refundPayment,
  listAllPayments,
  listMyPayments,
  getRevenue,
  getTransactionDetail,
};
