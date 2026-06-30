/* eslint-disable @typescript-eslint/no-explicit-any */
import { Accommodation } from "./accommodation.model";
import { IAccommodation } from "./accommodation.interface";
import AppError from "../../error/appError";
import { User } from "../user/user.model";
import { CleanerAssignment } from "../assignment/assignment.model";
import { Payment } from "../payment/payment.model";
import { CleaningSchedule } from "../schedule/schedule.model";

// Derive the cleaner's response to the latest schedule (what the host sees):
//   pending  → schedule sent, cleaner hasn't responded yet
//   refused  → cleaner refused
//   accepted → cleaner accepted (and any state after acceptance)
const cleanerResponseOf = (
  status: string,
): "pending" | "accepted" | "refused" => {
  if (status === "scheduled") return "pending";
  if (status === "refused") return "refused";
  return "accepted";
};

// ─── Create ───────────────────────────────────────────────────────────────────

const createAccommodation = async (
  hostId: string,
  payload: Partial<IAccommodation>,
) => {
  const host = await User.findById(hostId);
  if (!host) throw new AppError(404, "Host not found");
  if (host.role !== "host" && host.role !== "admin") {
    throw new AppError(403, "Only hosts can create an accommodation");
  }

  const newAccommodation = await Accommodation.create({
    ...payload,
    host: hostId,
  });

  return newAccommodation;
};

// ─── Get My Accommodations (with filter + pagination) ─────────────────────────

const getMyAccommodations = async (
  hostId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { host: hostId, isDeleted: false };

  // Filter by status
  if (query.status) {
    filter.status = query.status;
  }

  // Filter by accommodation type
  if (query.accommodationType) {
    filter.accommodationType = query.accommodationType;
  }

  // Filter by city
  if (query.city) {
    filter.city = new RegExp(String(query.city), "i");
  }

  // Search by name
  if (query.search) {
    filter.name = new RegExp(String(query.search), "i");
  }

  // Accommodation ids that have an accepted cleaner (for this host)
  const assignedIds = (
    await CleanerAssignment.distinct("accommodation", {
      host: hostId,
      status: "accepted",
    })
  ).map(String);

  // Filter by whether a cleaner is assigned (accepted)
  if (query.isCleanerAssigned !== undefined) {
    const wantAssigned = query.isCleanerAssigned === "true";
    filter._id = wantAssigned ? { $in: assignedIds } : { $nin: assignedIds };
  }

  const [rows, total] = await Promise.all([
    Accommodation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("host", "firstName lastName profileImage"),
    Accommodation.countDocuments(filter),
  ]);

  // All cleaners the host has assigned to the accommodations on this page
  const pageIds = rows.map((a) => a._id);
  const assignments = await CleanerAssignment.find({
    host: hostId,
    accommodation: { $in: pageIds },
  })
    .populate("cleaner", "firstName lastName name profileImage")
    .sort({ role: 1, createdAt: -1 }); // primary first

  // group assignments by accommodation id
  const cleanersByAccommodation = new Map<string, any[]>();
  for (const assignment of assignments) {
    const key = String(assignment.accommodation);
    if (!cleanersByAccommodation.has(key)) cleanersByAccommodation.set(key, []);
    cleanersByAccommodation.get(key)!.push({
      assignmentId: assignment._id,
      cleaner: assignment.cleaner,
      role: assignment.role,
      status: assignment.status,
      pricePerCleaning: assignment.pricePerCleaning,
    });
  }

  // latest payment per accommodation on this page
  const payments = await Payment.find({ accommodation: { $in: pageIds } })
    .sort({ createdAt: -1 })
    .select("accommodation status amount currency createdAt");

  const paymentByAccommodation = new Map<string, any>();
  for (const payment of payments) {
    const key = String(payment.accommodation);
    if (!paymentByAccommodation.has(key)) {
      paymentByAccommodation.set(key, {
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        createdAt: payment.createdAt,
      });
    }
  }

  // latest schedule per accommodation on this page (for the cleaner's response)
  const schedules = await CleaningSchedule.find({
    accommodation: { $in: pageIds },
  })
    .sort({ createdAt: -1 })
    .select("accommodation status date createdAt");

  const scheduleByAccommodation = new Map<string, any>();
  for (const schedule of schedules) {
    const key = String(schedule.accommodation);
    if (!scheduleByAccommodation.has(key)) {
      scheduleByAccommodation.set(key, schedule);
    }
  }

  // annotate each item with isCleanerAssigned + the assigned cleaners for the UI
  const data = rows.map((a) => {
    const latestSchedule = scheduleByAccommodation.get(String(a._id));
    return {
      ...a.toObject(),
      isCleanerAssigned: assignedIds.includes(String(a._id)),
      assignedCleaners: cleanersByAccommodation.get(String(a._id)) ?? [],
      paymentStatus: paymentByAccommodation.get(String(a._id))?.status ?? null,
      latestPayment: paymentByAccommodation.get(String(a._id)) ?? null,
      scheduleId: latestSchedule ? String(latestSchedule._id) : null,
      scheduleStatus: latestSchedule?.status ?? null,
      scheduleCleanerResponse: latestSchedule
        ? cleanerResponseOf(latestSchedule.status)
        : null,
    };
  });

  return {
    data,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Host dashboard: today / upcoming / to-do ─────────────────────────────────
//   today    → payment complete AND the cleaning is scheduled for today
//   upcoming → payment complete AND the cleaning is scheduled for a future day
//   toDo     → everything else (no paid+dated schedule yet)
// An accommodation appears in only one bucket (priority: today > upcoming > toDo).
const PAID_STATUSES = ["paid_held", "released"];

const getHostDashboard = async (hostId: string) => {
  // start & end of "today" in server time
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const accommodations = await Accommodation.find({
    host: hostId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .populate("host", "firstName lastName profileImage");

  const accIds = accommodations.map((a) => a._id);

  // All paid schedules for this host's accommodations
  const paidSchedules = await CleaningSchedule.find({
    host: hostId,
    accommodation: { $in: accIds },
    paymentStatus: { $in: PAID_STATUSES },
    status: { $nin: ["cancelled", "refused"] },
  })
    .populate("cleaner", "firstName lastName name profileImage")
    .sort({ date: 1 });

  // For each accommodation, keep the most relevant paid schedule:
  //   prefer a today/upcoming one (earliest future-or-today date)
  const todaySchedule = new Map<string, any>();
  const upcomingSchedule = new Map<string, any>();

  for (const s of paidSchedules) {
    const key = String(s.accommodation);
    const date = new Date(s.date);

    if (date >= todayStart && date <= todayEnd) {
      if (!todaySchedule.has(key)) todaySchedule.set(key, s);
    } else if (date > todayEnd) {
      if (!upcomingSchedule.has(key)) upcomingSchedule.set(key, s);
    }
  }

  const shape = (a: any, schedule: any) => ({
    ...a.toObject(),
    schedule: schedule
      ? {
          scheduleId: String(schedule._id),
          date: schedule.date,
          checkInTime: schedule.checkInTime,
          checkOutTime: schedule.checkOutTime,
          status: schedule.status,
          paymentStatus: schedule.paymentStatus,
          cleaner: schedule.cleaner,
        }
      : null,
  });

  const today: any[] = [];
  const upcoming: any[] = [];
  const toDo: any[] = [];

  for (const a of accommodations) {
    const key = String(a._id);
    if (todaySchedule.has(key)) {
      today.push(shape(a, todaySchedule.get(key)));
    } else if (upcomingSchedule.has(key)) {
      upcoming.push(shape(a, upcomingSchedule.get(key)));
    } else {
      toDo.push(shape(a, null));
    }
  }

  return {
    today,
    upcoming,
    toDo,
    counts: {
      today: today.length,
      upcoming: upcoming.length,
      toDo: toDo.length,
    },
  };
};

// ─── Get Single Accommodation ─────────────────────────────────────────────────

const getAccommodationById = async (hostId: string, accommodationId: string) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  }).populate("host", "firstName lastName profileImage");

  if (!accommodation) throw new AppError(404, "Accommodation not found");

  // All cleaners the host has assigned to this accommodation (primary first)
  const assignments = await CleanerAssignment.find({
    host: hostId,
    accommodation: accommodationId,
  })
    .populate("cleaner", "firstName lastName name profileImage")
    .sort({ role: 1, createdAt: -1 });

  const assignedCleaners = assignments.map((assignment) => ({
    assignmentId: assignment._id,
    cleaner: assignment.cleaner,
    role: assignment.role,
    status: assignment.status,
    pricePerCleaning: assignment.pricePerCleaning,
  }));

  // latest payment for this accommodation
  const latestPayment = await Payment.findOne({ accommodation: accommodationId })
    .sort({ createdAt: -1 })
    .select("status amount currency createdAt");

  // latest schedule for this accommodation (for the cleaner's response)
  const latestSchedule = await CleaningSchedule.findOne({
    accommodation: accommodationId,
  })
    .sort({ createdAt: -1 })
    .select("status date createdAt");

  return {
    ...accommodation.toObject(),
    isCleanerAssigned: assignments.some((a) => a.status === "accepted"),
    assignedCleaners,
    paymentStatus: latestPayment?.status ?? null,
    latestPayment: latestPayment
      ? {
          status: latestPayment.status,
          amount: latestPayment.amount,
          currency: latestPayment.currency,
          createdAt: latestPayment.createdAt,
        }
      : null,
    scheduleId: latestSchedule ? String(latestSchedule._id) : null,
    scheduleStatus: latestSchedule?.status ?? null,
    scheduleCleanerResponse: latestSchedule
      ? cleanerResponseOf(latestSchedule.status)
      : null,
  };
};

// ─── Cleaner: get a single accommodation they were requested for ──────────────

const getAccommodationForCleaner = async (
  cleanerId: string,
  accommodationId: string,
) => {
  // The cleaner can only see an accommodation the host has assigned/requested them on
  const myAssignment = await CleanerAssignment.findOne({
    accommodation: accommodationId,
    cleaner: cleanerId,
  });
  if (!myAssignment) {
    throw new AppError(
      404,
      "Accommodation not found or you have no request for it",
    );
  }

  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    isDeleted: false,
  }).populate("host", "firstName lastName name profileImage phone");
  if (!accommodation) throw new AppError(404, "Accommodation not found");

  // latest payment for this accommodation that belongs to this cleaner
  const latestPayment = await Payment.findOne({
    accommodation: accommodationId,
    cleaner: cleanerId,
  })
    .sort({ createdAt: -1 })
    .select("status amount currency createdAt");

  // latest schedule for this accommodation assigned to this cleaner
  const latestSchedule = await CleaningSchedule.findOne({
    accommodation: accommodationId,
    cleaner: cleanerId,
  })
    .sort({ createdAt: -1 })
    .select("status date createdAt");

  // Always expose the host's profileImage + phone (null when not set yet)
  const accObj = accommodation.toObject() as any;
  const host = accObj.host || {};
  accObj.host = {
    _id: host._id ?? null,
    firstName: host.firstName ?? null,
    lastName: host.lastName ?? null,
    name: host.name ?? null,
    profileImage: host.profileImage ?? null,
    phone: host.phone ?? null,
  };

  return {
    ...accObj,
    myAssignment: {
      assignmentId: myAssignment._id,
      role: myAssignment.role,
      status: myAssignment.status,
      pricePerCleaning: myAssignment.pricePerCleaning,
      message: myAssignment.message,
      respondedAt: myAssignment.respondedAt,
    },
    paymentStatus: latestPayment?.status ?? null,
    latestPayment: latestPayment
      ? {
          status: latestPayment.status,
          amount: latestPayment.amount,
          currency: latestPayment.currency,
          createdAt: latestPayment.createdAt,
        }
      : null,
    scheduleId: latestSchedule ? String(latestSchedule._id) : null,
    scheduleStatus: latestSchedule?.status ?? null,
    scheduleCleanerResponse: latestSchedule
      ? cleanerResponseOf(latestSchedule.status)
      : null,
  };
};

// ─── Update Accommodation ─────────────────────────────────────────────────────

const updateAccommodation = async (
  hostId: string,
  accommodationId: string,
  payload: Partial<IAccommodation>,
) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  });

  if (!accommodation) throw new AppError(404, "Accommodation not found");

  const updated = await Accommodation.findByIdAndUpdate(
    accommodationId,
    payload,
    { new: true, runValidators: true },
  );

  return updated;
};

// ─── Delete Accommodation (soft delete) ───────────────────────────────────────

const deleteAccommodation = async (hostId: string, accommodationId: string) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  });

  if (!accommodation) throw new AppError(404, "Accommodation not found");

  accommodation.isDeleted = true;
  await accommodation.save();

  return { message: "Accommodation deleted successfully" };
};

export const AccommodationService = {
  createAccommodation,
  getMyAccommodations,
  getHostDashboard,
  getAccommodationById,
  getAccommodationForCleaner,
  updateAccommodation,
  deleteAccommodation,
};
