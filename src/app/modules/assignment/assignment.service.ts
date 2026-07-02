/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { CleanerAssignment } from "./assignment.model";
import { TAssignmentRole } from "./assignment.interface";
import { Accommodation } from "../accommodation/accommodation.model";
import { User } from "../user/user.model";
import AppError from "../../error/appError";
import { NotificationService } from "../notification/notification.service";

const CLEANER_PROFILE_FIELDS =
  "firstName lastName name profileImage interventionZone about biography languages servicesOffered cleaningsCompleted siretNumber isProfessionalVerified workCity serviceRadius licenseNumber availability kycLevel createdAt";

// ─── Helper: ensure the accommodation belongs to the host ─────────────────────
const ensureOwnAccommodation = async (hostId: string, accommodationId: string) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  });
  if (!accommodation) throw new AppError(404, "Accommodation not found");
  return accommodation;
};

// ─── Host: assign a cleaner to an accommodation ───────────────────────────────
const assignCleaner = async (
  hostId: string,
  accommodationId: string,
  payload: {
    cleanerId: string;
    role: TAssignmentRole;
    pricePerCleaning?: number;
    message?: string;
  },
) => {
  const accommodation = await ensureOwnAccommodation(hostId, accommodationId);

  const cleaner = await User.findById(payload.cleanerId);
  if (!cleaner || cleaner.isDeleted) throw new AppError(404, "Cleaner not found");
  if (cleaner.role !== "cleaner") {
    throw new AppError(400, "Selected user is not a cleaner");
  }

  const existing = await CleanerAssignment.findOne({
    accommodation: accommodationId,
    cleaner: payload.cleanerId,
  });
  if (existing) {
    throw new AppError(409, "This cleaner is already assigned to this accommodation");
  }

  // If assigning as primary, demote any current primary to substitute.
  if (payload.role === "primary") {
    await CleanerAssignment.updateMany(
      { accommodation: accommodationId, role: "primary" },
      { role: "substitute" },
    );
  }

  const assignment = await CleanerAssignment.create({
    accommodation: accommodationId,
    host: hostId,
    cleaner: payload.cleanerId,
    role: payload.role,
    pricePerCleaning: payload.pricePerCleaning ?? accommodation.cleaningRate,
    message: payload.message,
    status: "pending",
  });

  await NotificationService.createNotification({
    user: payload.cleanerId,
    title: "New cleaning request",
    message: `A host wants to add you for ${accommodation.name}.`,
    type: "assignment_request",
    data: { assignmentId: String(assignment._id), accommodationId },
  });

  return assignment;
};

// ─── Cleaner: accept / refuse an assignment request ───────────────────────────
const respondToAssignment = async (
  cleanerId: string,
  assignmentId: string,
  action: "accept" | "refuse",
) => {
  const assignment = await CleanerAssignment.findOne({
    _id: assignmentId,
    cleaner: cleanerId,
  }).populate("accommodation", "name");
  if (!assignment) throw new AppError(404, "Assignment request not found");
  if (assignment.status !== "pending") {
    throw new AppError(400, `Request already ${assignment.status}`);
  }

  assignment.status = action === "accept" ? "accepted" : "refused";
  assignment.respondedAt = new Date();
  await assignment.save();

  const accName = (assignment.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(assignment.host),
    title: `Cleaning request ${assignment.status}`,
    message: `A cleaner has ${assignment.status} your request for ${accName}.`,
    type: "assignment_response",
    data: { assignmentId: String(assignment._id) },
  });

  return assignment;
};

// ─── Host: change a cleaner's role (primary <-> substitute swap) ──────────────
const changeRole = async (
  hostId: string,
  assignmentId: string,
  role: TAssignmentRole,
) => {
  const assignment = await CleanerAssignment.findOne({
    _id: assignmentId,
    host: hostId,
  });
  if (!assignment) throw new AppError(404, "Assignment not found");

  if (role === assignment.role) return assignment;

  if (role === "primary") {
    // demote the current primary (if any) to substitute, then promote this one
    await CleanerAssignment.updateMany(
      {
        accommodation: assignment.accommodation,
        role: "primary",
        _id: { $ne: assignment._id },
      },
      { role: "substitute" },
    );
  }

  assignment.role = role;
  await assignment.save();
  return assignment;
};

// ─── Host: remove a cleaner from an accommodation ─────────────────────────────
const removeAssignment = async (hostId: string, assignmentId: string) => {
  const assignment = await CleanerAssignment.findOneAndDelete({
    _id: assignmentId,
    host: hostId,
  });
  if (!assignment) throw new AppError(404, "Assignment not found");
  return { message: "Cleaner removed from accommodation" };
};

// ─── Host: list all cleaners assigned to an accommodation ─────────────────────
const getAccommodationCleaners = async (
  hostId: string,
  accommodationId: string,
) => {
  await ensureOwnAccommodation(hostId, accommodationId);

  const assignments = await CleanerAssignment.find({
    accommodation: accommodationId,
  })
    .populate("cleaner", CLEANER_PROFILE_FIELDS)
    .sort({ role: 1, createdAt: -1 }); // primary first

  return assignments;
};

// ─── Find housekeepers (the "Find a housekeeper" screen) ──────────────────────
const findHousekeepers = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = {
    role: "cleaner",
    isDeleted: false,
    isActive: true,
  };

  if (query.search) {
    const rx = new RegExp(String(query.search), "i");
    filter.$or = [{ name: rx }, { firstName: rx }, { lastName: rx }, { interventionZone: rx }];
  }
  if (query.interventionZone) {
    filter.interventionZone = new RegExp(String(query.interventionZone), "i");
  }

  const [data, total] = await Promise.all([
    User.find(filter)
      .select(CLEANER_PROFILE_FIELDS)
      .sort({ cleaningsCompleted: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Single cleaner profile (the housekeeper detail screen) ───────────────────
const getCleanerProfile = async (cleanerId: string) => {
  const cleaner = await User.findOne({
    _id: cleanerId,
    role: "cleaner",
    isDeleted: false,
  }).select(CLEANER_PROFILE_FIELDS + " phone");
  if (!cleaner) throw new AppError(404, "Cleaner not found");
  return cleaner;
};

// ─── Cleaner: my incoming requests (Requests screen) ──────────────────────────
const getMyRequests = async (
  cleanerId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { cleaner: cleanerId };
  // status optional: empty -> all requests (pending + accepted + refused)
  if (query.status) filter.status = query.status;

  const [data, total] = await Promise.all([
    CleanerAssignment.find(filter)
      .populate("accommodation", "name address city photos cleaningRate")
      .populate("host", "firstName lastName name profileImage createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CleanerAssignment.countDocuments(filter),
  ]);

  // total (non-deleted) properties per host shown on this page
  const hostIds = [
    ...new Set(
      data
        .map((a) => (a.host as any)?._id)
        .filter(Boolean)
        .map(String),
    ),
  ];

  const propertyCounts = await Accommodation.aggregate([
    {
      $match: {
        host: { $in: hostIds.map((id) => new Types.ObjectId(id)) },
        isDeleted: false,
      },
    },
    { $group: { _id: "$host", count: { $sum: 1 } } },
  ]);

  const countByHost = new Map<string, number>(
    propertyCounts.map((p: any) => [String(p._id), p.count]),
  );

  const rows = data.map((a) => {
    const obj = a.toObject();
    const host = obj.host as any;
    if (host && typeof host === "object") {
      obj.host = {
        ...host,
        totalProperties: countByHost.get(String(host._id)) ?? 0,
        memberSince: host.createdAt ?? null,
      };
    }
    return obj;
  });

  return {
    data: rows,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Cleaner: my accepted accommodations ──────────────────────────────────────
const getMyAccommodations = async (
  cleanerId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { cleaner: cleanerId, status: "accepted" };

  const [data, total] = await Promise.all([
    CleanerAssignment.find(filter)
      .populate("accommodation", "name address city photos cleaningRate accommodationType")
      .populate("host", "firstName lastName name profileImage phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CleanerAssignment.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Internal helper used by the schedule module ──────────────────────────────
const getAcceptedPrimary = async (accommodationId: string | Types.ObjectId) => {
  return CleanerAssignment.findOne({
    accommodation: accommodationId,
    role: "primary",
    status: "accepted",
  });
};

// A specific cleaner's ACCEPTED assignment (primary or substitute) on an
// accommodation — used when the host picks who to schedule. The id may be the
// cleaner's user id OR the assignment's own id (the host UI has both), so we
// match either. Returns null if not assigned there / not accepted yet.
const getAcceptedAssignment = async (
  accommodationId: string | Types.ObjectId,
  cleanerOrAssignmentId: string | Types.ObjectId,
) => {
  const id = String(cleanerOrAssignmentId);
  if (!Types.ObjectId.isValid(id)) return null;

  return CleanerAssignment.findOne({
    accommodation: accommodationId,
    status: "accepted",
    $or: [{ cleaner: id }, { _id: id }],
  });
};

export const AssignmentService = {
  assignCleaner,
  respondToAssignment,
  changeRole,
  removeAssignment,
  getAccommodationCleaners,
  findHousekeepers,
  getCleanerProfile,
  getMyRequests,
  getMyAccommodations,
  getAcceptedPrimary,
  getAcceptedAssignment,
};
