/* eslint-disable @typescript-eslint/no-explicit-any */
import { Accommodation } from "./accommodation.model";
import { IAccommodation } from "./accommodation.interface";
import AppError from "../../error/appError";
import { User } from "../user/user.model";
import { CleanerAssignment } from "../assignment/assignment.model";

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

  // annotate each item with isCleanerAssigned + the assigned cleaners for the UI
  const data = rows.map((a) => ({
    ...a.toObject(),
    isCleanerAssigned: assignedIds.includes(String(a._id)),
    assignedCleaners: cleanersByAccommodation.get(String(a._id)) ?? [],
  }));

  return {
    data,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
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

  return {
    ...accommodation.toObject(),
    isCleanerAssigned: assignments.some((a) => a.status === "accepted"),
    assignedCleaners,
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
  getAccommodationById,
  updateAccommodation,
  deleteAccommodation,
};
