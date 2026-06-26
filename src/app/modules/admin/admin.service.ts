/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { User } from "../user/user.model";
import { Accommodation } from "../accommodation/accommodation.model";
import { CleaningSchedule } from "../schedule/schedule.model";
import { Payment } from "../payment/payment.model";
import { SupportTicket } from "../support/support.model";
import AppError from "../../error/appError";

const toMoney = (cents: number) => Math.round((cents || 0)) / 100;

// ─── Dashboard ────────────────────────────────────────────────────────────────
const getDashboard = async (query: Record<string, unknown>) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // chart range: "this_month" (default) or "all"
  const range = (query.range as string) || "this_month";
  const rangeMatch: any = range === "all" ? {} : { createdAt: { $gte: monthStart } };

  const [
    revenueAgg,
    totalHosts,
    totalCleaners,
    totalCompletedJobs,
    completedInRange,
    cancelledInRange,
    jobsCreatedToday,
    completedToday,
    recentSupport,
  ] = await Promise.all([
    Payment.aggregate([
      { $match: { status: "released" } },
      { $group: { _id: null, total: { $sum: "$platformFee" } } },
    ]),
    User.countDocuments({ role: "host", isDeleted: false }),
    User.countDocuments({ role: "cleaner", isDeleted: false }),
    CleaningSchedule.countDocuments({ status: "completed" }),
    CleaningSchedule.countDocuments({ ...rangeMatch, status: "completed" }),
    CleaningSchedule.countDocuments({
      ...rangeMatch,
      status: { $in: ["cancelled", "refused"] },
    }),
    CleaningSchedule.countDocuments({ createdAt: { $gte: todayStart } }),
    CleaningSchedule.countDocuments({
      status: "completed",
      completedAt: { $gte: todayStart },
    }),
    SupportTicket.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("user", "firstName lastName name profileImage"),
  ]);

  const chartTotal = completedInRange + cancelledInRange;
  const pct = (n: number) =>
    chartTotal ? Math.round((n / chartTotal) * 100) : 0;

  return {
    cards: {
      totalRevenue: toMoney(revenueAgg[0]?.total || 0), // platform commission earned
      totalHosts,
      totalCleaners,
      totalCompletedJobs,
    },
    chart: {
      range,
      total: chartTotal,
      completed: { count: completedInRange, percent: pct(completedInRange) },
      cancelled: { count: cancelledInRange, percent: pct(cancelledInRange) },
    },
    todayStatus: {
      jobCreate: jobsCreatedToday,
      completed: completedToday,
    },
    recentSupport,
  };
};

// ─── Hosts ────────────────────────────────────────────────────────────────────
const buildSearch = (search: unknown, fields: string[]) => {
  if (!search) return {};
  const rx = new RegExp(String(search), "i");
  return { $or: fields.map((f) => ({ [f]: rx })) };
};

const getHosts = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = {
    role: "host",
    isDeleted: false,
    ...buildSearch(query.search, ["name", "firstName", "lastName", "email"]),
  };

  const [hosts, total] = await Promise.all([
    User.find(filter)
      .select("firstName lastName name email phone profileImage city workCity isActive createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const data = await Promise.all(
    hosts.map(async (h) => {
      const [properties, schedules, payAgg] = await Promise.all([
        Accommodation.countDocuments({ host: h._id, isDeleted: false }),
        CleaningSchedule.countDocuments({ host: h._id }),
        Payment.aggregate([
          { $match: { host: h._id, status: { $in: ["paid_held", "released"] } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);
      return {
        ...h.toObject(),
        properties,
        scheduleCleaning: schedules,
        totalPay: toMoney(payAgg[0]?.total || 0),
      };
    }),
  );

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

const getHostById = async (id: string) => {
  const host = await User.findOne({ _id: id, role: "host" }).select(
    "firstName lastName name email phone profileImage isActive createdAt",
  );
  if (!host) throw new AppError(404, "Host not found");

  const [totalProperties, totalSchedules, payAgg] = await Promise.all([
    Accommodation.countDocuments({ host: id, isDeleted: false }),
    CleaningSchedule.countDocuments({ host: id }),
    Payment.aggregate([
      { $match: { host: new Types.ObjectId(id), status: { $in: ["paid_held", "released"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  return {
    ...host.toObject(),
    totalProperties,
    totalSchedules,
    totalPay: toMoney(payAgg[0]?.total || 0),
  };
};

// ─── Cleaners ─────────────────────────────────────────────────────────────────
const getCleaners = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = {
    role: "cleaner",
    isDeleted: false,
    ...buildSearch(query.search, ["name", "firstName", "lastName", "email", "siretNumber"]),
  };

  const [cleaners, total] = await Promise.all([
    User.find(filter)
      .select("firstName lastName name email phone profileImage siretNumber interventionZone workCity cleaningsCompleted isActive createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const data = await Promise.all(
    cleaners.map(async (c) => {
      const [completedJobs, earnAgg] = await Promise.all([
        CleaningSchedule.countDocuments({ cleaner: c._id, status: "completed" }),
        Payment.aggregate([
          { $match: { cleaner: c._id, status: "released" } },
          { $group: { _id: null, total: { $sum: "$cleanerAmount" } } },
        ]),
      ]);
      return {
        ...c.toObject(),
        completedJobs,
        totalEarn: toMoney(earnAgg[0]?.total || 0),
      };
    }),
  );

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

const getCleanerById = async (id: string) => {
  const cleaner = await User.findOne({ _id: id, role: "cleaner" }).select(
    "firstName lastName name email phone profileImage siretNumber interventionZone workCity cleaningsCompleted isActive createdAt",
  );
  if (!cleaner) throw new AppError(404, "Cleaner not found");

  const [completedJobs, earnAgg] = await Promise.all([
    CleaningSchedule.countDocuments({ cleaner: id, status: "completed" }),
    Payment.aggregate([
      { $match: { cleaner: new Types.ObjectId(id), status: "released" } },
      { $group: { _id: null, total: { $sum: "$cleanerAmount" } } },
    ]),
  ]);

  return {
    ...cleaner.toObject(),
    completedJobs,
    totalEarning: toMoney(earnAgg[0]?.total || 0),
  };
};

// ─── Schedules / Jobs ─────────────────────────────────────────────────────────
const getSchedules = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  const [data, total] = await Promise.all([
    CleaningSchedule.find(filter)
      .populate("accommodation", "name address city cleaningRate photos")
      .populate("host", "firstName lastName name email")
      .populate("cleaner", "firstName lastName name email siretNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CleaningSchedule.countDocuments(filter),
  ]);

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Transactions ─────────────────────────────────────────────────────────────
const getTransactions = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (query.status) filter.status = query.status;

  const [rows, total] = await Promise.all([
    Payment.find(filter)
      .populate("host", "firstName lastName name email")
      .populate("accommodation", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);

  const data = rows.map((p) => {
    const host = p.host as any;
    return {
      _id: p._id,
      jobId: p.schedule,
      hostName: host?.name || `${host?.firstName || ""} ${host?.lastName || ""}`.trim(),
      email: host?.email,
      accommodation: (p.accommodation as any)?.name,
      transactionNumber: p.stripeChargeId || p.stripePaymentIntentId,
      amount: toMoney(p.amount),
      currency: p.currency,
      status: p.status,
      dateTime: p.createdAt,
    };
  });

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Block / unblock a user ───────────────────────────────────────────────────
const setUserBlocked = async (id: string, block: boolean) => {
  const user = await User.findById(id);
  if (!user) throw new AppError(404, "User not found");
  if (user.role === "admin") throw new AppError(400, "Cannot block an admin");

  user.isActive = !block;
  await user.save();

  return {
    _id: user._id,
    isActive: user.isActive,
    blocked: block,
  };
};

export const AdminService = {
  getDashboard,
  getHosts,
  getHostById,
  getCleaners,
  getCleanerById,
  getSchedules,
  getTransactions,
  setUserBlocked,
};
