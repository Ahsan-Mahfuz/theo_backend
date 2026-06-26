/* eslint-disable @typescript-eslint/no-explicit-any */
import { CleaningSchedule } from "./schedule.model";
import { Accommodation } from "../accommodation/accommodation.model";
import { User } from "../user/user.model";
import { AssignmentService } from "../assignment/assignment.service";
import { NotificationService } from "../notification/notification.service";
import { PaymentService } from "../payment/payment.service";
import AppError from "../../error/appError";

// ─── Host: create a schedule (Proceed to Schedule) ────────────────────────────
const createSchedule = async (
  hostId: string,
  accommodationId: string,
  payload: {
    date: string;
    checkInTime: string;
    checkOutTime: string;
    notes?: string;
  },
) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  });
  if (!accommodation) throw new AppError(404, "Accommodation not found");

  // BACKEND RESTRICTION: cannot schedule without an accepted primary cleaner
  const primary = await AssignmentService.getAcceptedPrimary(accommodationId);
  if (!primary) {
    throw new AppError(
      400,
      "You must assign a cleaner (who has accepted) before scheduling.",
    );
  }

  const schedule = await CleaningSchedule.create({
    accommodation: accommodationId,
    host: hostId,
    cleaner: primary.cleaner,
    assignment: primary._id,
    date: new Date(payload.date),
    checkInTime: payload.checkInTime,
    checkOutTime: payload.checkOutTime,
    notes: payload.notes,
    status: "scheduled",
  });

  accommodation.status = "scheduled";
  await accommodation.save();

  await NotificationService.createNotification({
    user: String(primary.cleaner),
    title: "New cleaning scheduled",
    message: `${accommodation.name} is scheduled for ${new Date(payload.date).toDateString()} (${payload.checkInTime}–${payload.checkOutTime}).`,
    type: "schedule_created",
    data: { scheduleId: String(schedule._id), accommodationId },
  });

  return schedule;
};

// ─── Cleaner: accept / refuse a schedule ──────────────────────────────────────
const respondToSchedule = async (
  cleanerId: string,
  scheduleId: string,
  action: "accept" | "refuse",
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    cleaner: cleanerId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (schedule.status !== "scheduled") {
    throw new AppError(400, `Schedule already ${schedule.status}`);
  }

  const accName = (schedule.accommodation as any)?.name || "an accommodation";

  if (action === "accept") {
    schedule.status = "accepted";
    await schedule.save();

    await NotificationService.createNotification({
      user: String(schedule.host),
      title: "Cleaning accepted",
      message: `The cleaner accepted the cleaning for ${accName}. You can now proceed to payment.`,
      type: "schedule_created",
      data: { scheduleId: String(schedule._id) },
    });
  } else {
    schedule.status = "refused";
    await schedule.save();

    // free the accommodation again
    await Accommodation.findByIdAndUpdate(schedule.accommodation, {
      status: "not_scheduled",
    });

    await NotificationService.createNotification({
      user: String(schedule.host),
      title: "Cleaning refused",
      message: `The cleaner refused the cleaning for ${accName}.`,
      type: "schedule_created",
      data: { scheduleId: String(schedule._id) },
    });
  }

  return schedule;
};

// ─── Host: my schedules ───────────────────────────────────────────────────────
const getHostSchedules = async (
  hostId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { host: hostId };
  if (query.status) filter.status = query.status;
  if (query.accommodationId) filter.accommodation = query.accommodationId;

  const [data, total] = await Promise.all([
    CleaningSchedule.find(filter)
      .populate("accommodation", "name address city photos")
      .populate("cleaner", "firstName lastName name profileImage phone")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    CleaningSchedule.countDocuments(filter),
  ]);

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Cleaner: my schedules ────────────────────────────────────────────────────
const getCleanerSchedules = async (
  cleanerId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { cleaner: cleanerId };
  if (query.status) filter.status = query.status;

  const [data, total] = await Promise.all([
    CleaningSchedule.find(filter)
      .populate("accommodation", "name address city photos accommodationType surface floor numberOfRooms keys accessCode instructions")
      .populate("host", "firstName lastName name profileImage phone")
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit),
    CleaningSchedule.countDocuments(filter),
  ]);

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Single schedule (host or its cleaner) ────────────────────────────────────
const getScheduleById = async (userId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findById(scheduleId)
    .populate("accommodation")
    .populate("host", "firstName lastName name profileImage phone")
    .populate("cleaner", "firstName lastName name profileImage phone");
  if (!schedule) throw new AppError(404, "Schedule not found");

  const host = schedule.host as any;
  const cleaner = schedule.cleaner as any;
  const isParty =
    String(host?._id || host) === userId ||
    String(cleaner?._id || cleaner) === userId;
  if (!isParty) throw new AppError(403, "You are not part of this schedule");

  return schedule;
};

// ─── Cleaner: submit proof of completion ──────────────────────────────────────
const submitProof = async (
  cleanerId: string,
  scheduleId: string,
  payload: { proofNotes?: string; proofPhotos: string[] },
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    cleaner: cleanerId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (["completed", "cancelled", "refused"].includes(schedule.status)) {
    throw new AppError(400, `Cannot submit proof on a ${schedule.status} task`);
  }

  schedule.proofPhotos = payload.proofPhotos;
  schedule.proofNotes = payload.proofNotes;
  schedule.proofSubmittedAt = new Date();
  schedule.status = "proof_submitted";
  await schedule.save();

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.host),
    title: "Proof submitted",
    message: `The cleaner submitted proof of completion for ${accName}.`,
    type: "proof_submitted",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

// ─── Cleaner: report a dispute ────────────────────────────────────────────────
const reportDispute = async (
  cleanerId: string,
  scheduleId: string,
  payload: { reason?: string; notes?: string; photos: string[] },
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    cleaner: cleanerId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (["completed", "cancelled", "refused"].includes(schedule.status)) {
    throw new AppError(400, `Cannot dispute a ${schedule.status} task`);
  }

  schedule.dispute = {
    reason: payload.reason,
    notes: payload.notes,
    photos: payload.photos,
    raisedAt: new Date(),
  };
  schedule.status = "disputed";
  await schedule.save();

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.host),
    title: "Dispute reported",
    message: `The cleaner reported a dispute for ${accName}.`,
    type: "dispute",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

// ─── Host: complete / accept the task ─────────────────────────────────────────
const completeTask = async (hostId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (schedule.status === "completed") {
    throw new AppError(400, "Task already completed");
  }

  // Strict escrow gate: the host must have paid before approving the work.
  if (schedule.paymentStatus !== "paid_held") {
    throw new AppError(
      400,
      "Payment must be completed before approving this task.",
    );
  }

  schedule.status = "completed";
  schedule.completedAt = new Date();
  await schedule.save();

  // bump the cleaner's completed counter
  await User.findByIdAndUpdate(schedule.cleaner, {
    $inc: { cleaningsCompleted: 1 },
  });

  // Release the held funds to the cleaner (95%, platform keeps the fee).
  try {
    await PaymentService.releaseForSchedule(String(schedule._id));
  } catch (err) {
    // Completion stays committed; an admin can retry the payout if this fails.
    console.error("⚠️ Payout release failed:", (err as Error).message);
  }

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.cleaner),
    title: "Task completed",
    message: `The host marked the cleaning for ${accName} as completed.`,
    type: "task_completed",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

export const ScheduleService = {
  createSchedule,
  respondToSchedule,
  getHostSchedules,
  getCleanerSchedules,
  getScheduleById,
  submitProof,
  reportDispute,
  completeTask,
};
