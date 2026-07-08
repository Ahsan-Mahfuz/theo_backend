/* eslint-disable @typescript-eslint/no-explicit-any */
import { CleaningSchedule } from "./schedule.model";
import { Accommodation } from "../accommodation/accommodation.model";
import { User } from "../user/user.model";
import { AssignmentService } from "../assignment/assignment.service";
import { NotificationService } from "../notification/notification.service";
import { PaymentService } from "../payment/payment.service";
import { Payment } from "../payment/payment.model";
import AppError from "../../error/appError";
import config from "../../config";

// Currency the host is charged in (matches the payment module).
const PAY_CURRENCY = config.platform_currency || "usd";

// Estimated duration (in hours) between checkInTime and checkOutTime ("HH:mm")
const estimationHours = (checkInTime: string, checkOutTime: string): number => {
  const [h1, m1] = checkInTime.split(":").map(Number);
  const [h2, m2] = checkOutTime.split(":").map(Number);
  let minutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (minutes < 0) minutes += 24 * 60; // crosses midnight
  return Math.round((minutes / 60) * 10) / 10;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "Wednesday 15 May" (matches the planning UI)
const dayLabelOf = (date: Date): string =>
  `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;

// "2024-05-15" key for grouping / calendar dots
const dayKeyOf = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Always expose the host's profileImage + phone (null when not set yet).
// Mongoose drops unset fields after populate, so we backfill them here.
const normalizeHost = (host: any) => {
  if (!host || typeof host !== "object") return host;
  return {
    _id: host._id ?? null,
    firstName: host.firstName ?? null,
    lastName: host.lastName ?? null,
    name: host.name ?? null,
    profileImage: host.profileImage ?? null,
    phone: host.phone ?? null,
  };
};

// Shape a schedule into a cleaner-facing mission card (Home / Planning screens)
const toMissionCard = (s: any) => {
  const obj = s.toObject ? s.toObject() : s;
  // How much the host is paying the cleaner for this job: the agreed price on
  // the assignment, falling back to the accommodation's cleaning rate.
  const assignment = obj.assignment;
  const accommodation = obj.accommodation;
  const payAmount =
    (assignment && typeof assignment === "object"
      ? assignment.pricePerCleaning
      : undefined) ??
    (accommodation && typeof accommodation === "object"
      ? accommodation.cleaningRate
      : undefined) ??
    null;
  return {
    ...obj,
    host: normalizeHost(obj.host),
    dayKey: dayKeyOf(new Date(obj.date)),
    dayLabel: dayLabelOf(new Date(obj.date)),
    estimationHours: estimationHours(obj.checkInTime, obj.checkOutTime),
    cleanerResponse: cleanerResponseOf(obj.status),
    payAmount,
    payCurrency: PAY_CURRENCY,
  };
};

// Derive the cleaner's response to a schedule (what the host wants to see):
//   pending  → sent, cleaner hasn't responded yet
//   refused  → cleaner refused
//   accepted → cleaner accepted (and any state after acceptance)
const cleanerResponseOf = (
  status: string,
): "pending" | "accepted" | "refused" => {
  if (status === "scheduled") return "pending";
  if (status === "refused") return "refused";
  return "accepted";
};

// Start/end of the calendar day for a given date (used for same-day checks)
const dayRange = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Is there already an active schedule for this accommodation on this day?
// Refused / cancelled schedules don't count — the host may re-schedule those.
const findSameDaySchedule = async (
  accommodationId: string,
  date: Date,
  excludeId?: string,
) => {
  const { start, end } = dayRange(date);
  const filter: any = {
    accommodation: accommodationId,
    date: { $gte: start, $lte: end },
    status: { $nin: ["refused", "cancelled"] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return CleaningSchedule.findOne(filter);
};

// ─── Host: create a schedule (Proceed to Schedule) ────────────────────────────
const createSchedule = async (
  hostId: string,
  accommodationId: string,
  payload: {
    cleanerId: string;
    date: string;
    checkInTime: string;
    checkOutTime: string;
    notes?: string;
    bookingId?: string;
  },
) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  });
  if (!accommodation) throw new AppError(404, "Accommodation not found");

  // The host picks WHICH assigned cleaner to schedule. That cleaner must already
  // be a primary/substitute on this accommodation AND have accepted the request,
  // so the schedule only lands in that one cleaner's inbox.
  const assignment = await AssignmentService.getAcceptedAssignment(
    accommodationId,
    payload.cleanerId,
  );
  if (!assignment) {
    throw new AppError(
      400,
      "This cleaner is not an accepted primary/substitute for this accommodation. Assign them first (and have them accept) before scheduling.",
    );
  }

  // Block a duplicate schedule for the same accommodation on the same day
  const existing = await findSameDaySchedule(
    accommodationId,
    new Date(payload.date),
  );
  if (existing) {
    throw new AppError(
      409,
      "You already created a schedule on this date. Please edit the schedule if you want.",
    );
  }

  const schedule = await CleaningSchedule.create({
    accommodation: accommodationId,
    host: hostId,
    cleaner: assignment.cleaner,
    assignment: assignment._id,
    booking: payload.bookingId,
    date: new Date(payload.date),
    checkInTime: payload.checkInTime,
    checkOutTime: payload.checkOutTime,
    notes: payload.notes,
    status: "scheduled",
  });

  // Targeted status update — a full-document .save() would re-validate every
  // field and fail on legacy records (e.g. an accommodationType not in the
  // current enum), blocking scheduling for an unrelated reason.
  await Accommodation.findByIdAndUpdate(accommodationId, { status: "scheduled" });

  await NotificationService.createNotification({
    user: String(assignment.cleaner),
    title: "New cleaning scheduled",
    message: `${accommodation.name} is scheduled for ${new Date(payload.date).toDateString()} (${payload.checkInTime}–${payload.checkOutTime}).`,
    type: "schedule_created",
    data: { scheduleId: String(schedule._id), accommodationId },
  });

  return schedule;
};

// ─── Host: edit a schedule (only before the cleaner accepts) ──────────────────
const updateSchedule = async (
  hostId: string,
  scheduleId: string,
  payload: {
    cleanerId?: string;
    date?: string;
    checkInTime?: string;
    checkOutTime?: string;
    notes?: string;
  },
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");

  // Once the cleaner has accepted (or the task moved on), the host can't edit.
  if (schedule.status !== "scheduled") {
    throw new AppError(
      400,
      schedule.status === "refused"
        ? "This schedule was refused. Please create a new one."
        : "The cleaner has already accepted this schedule, so it can no longer be edited.",
    );
  }

  // Re-assign to a different cleaner. The new cleaner must also be an accepted
  // primary/substitute on this accommodation. We notify the previous cleaner
  // that the pending request no longer applies to them.
  const previousCleanerId = String(schedule.cleaner);
  if (payload.cleanerId && payload.cleanerId !== previousCleanerId) {
    const accommodationId = String(
      (schedule.accommodation as any)?._id || schedule.accommodation,
    );
    const assignment = await AssignmentService.getAcceptedAssignment(
      accommodationId,
      payload.cleanerId,
    );
    if (!assignment) {
      throw new AppError(
        400,
        "This cleaner is not an accepted primary/substitute for this accommodation.",
      );
    }
    schedule.cleaner = assignment.cleaner as any;
    schedule.assignment = assignment._id as any;

    const accName = (schedule.accommodation as any)?.name || "an accommodation";
    await NotificationService.createNotification({
      user: previousCleanerId,
      title: "Cleaning schedule reassigned",
      message: `The host reassigned the cleaning for ${accName} to another cleaner.`,
      type: "schedule_created",
      data: { scheduleId: String(schedule._id) },
    });
  }

  // If the date changes to a *different* day, make sure it doesn't clash with
  // another schedule. Keeping the same day (e.g. editing only the time/notes)
  // must not trip the duplicate guard against itself.
  if (payload.date) {
    const newDate = new Date(payload.date);
    const isSameDay =
      dayRange(schedule.date).start.getTime() ===
      dayRange(newDate).start.getTime();

    if (!isSameDay) {
      const clash = await findSameDaySchedule(
        String(schedule.accommodation?._id || schedule.accommodation),
        newDate,
        String(schedule._id),
      );
      if (clash) {
        throw new AppError(
          409,
          "You already created a schedule on this date. Please edit the schedule if you want.",
        );
      }
    }
    schedule.date = newDate;
  }

  if (payload.checkInTime !== undefined) schedule.checkInTime = payload.checkInTime;
  if (payload.checkOutTime !== undefined)
    schedule.checkOutTime = payload.checkOutTime;
  if (payload.notes !== undefined) schedule.notes = payload.notes;

  await schedule.save();

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.cleaner),
    title: "Cleaning schedule updated",
    message: `The host updated the cleaning for ${accName} — ${schedule.date.toDateString()} (${schedule.checkInTime}–${schedule.checkOutTime}).`,
    type: "schedule_created",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

// ─── Host: delete a schedule (only before the cleaner accepts) ────────────────
const deleteSchedule = async (hostId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");

  // Block deletion once money/work is involved.
  if (schedule.paymentStatus !== "unpaid") {
    throw new AppError(
      400,
      "This schedule has a payment attached and can no longer be deleted.",
    );
  }
  if (!["scheduled", "refused", "cancelled"].includes(schedule.status)) {
    throw new AppError(
      400,
      "The cleaner has already accepted this schedule, so it can no longer be deleted.",
    );
  }

  const accommodationId = schedule.accommodation?._id || schedule.accommodation;
  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  const wasScheduled = schedule.status === "scheduled";

  await schedule.deleteOne();

  // free the accommodation again
  await Accommodation.findByIdAndUpdate(accommodationId, {
    status: "not_scheduled",
  });

  // only notify the cleaner if they had a pending request waiting
  if (wasScheduled) {
    await NotificationService.createNotification({
      user: String(schedule.cleaner),
      title: "Cleaning schedule cancelled",
      message: `The host cancelled the cleaning for ${accName}.`,
      type: "schedule_created",
      data: { scheduleId: String(schedule._id) },
    });
  }

  return { message: "Schedule deleted successfully" };
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
  if (query.accommodationId) filter.accommodation = query.accommodationId;

  // Named lifecycle views for the host planning-list tabs. These map the raw
  // status + paymentStatus into the buckets the UI shows:
  //   awaiting → schedule sent, cleaner hasn't accepted yet
  //   accepted → cleaner accepted (paid or not)
  //   pay_now  → cleaner accepted but the host hasn't paid yet
  //   paid     → escrow funded (held) or already released to the cleaner
  const view = query.view ? String(query.view) : undefined;
  if (view === "awaiting") {
    filter.status = "scheduled";
  } else if (view === "accepted") {
    // "accepted" covers cleaner-accepted jobs whether or not the host has paid.
    // Once paid, the job advances to "in_progress" — keep it in this tab too.
    filter.status = { $in: ["accepted", "in_progress"] };
  } else if (view === "pay_now") {
    filter.status = "accepted";
    filter.paymentStatus = "unpaid";
  } else if (view === "paid") {
    filter.paymentStatus = { $in: ["paid_held", "released"] };
  } else if (query.status) {
    filter.status = query.status;
  }

  const [data, total] = await Promise.all([
    CleaningSchedule.find(filter)
      .populate("accommodation", "name address city photos")
      .populate("cleaner", "firstName lastName name profileImage phone")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    CleaningSchedule.countDocuments(filter),
  ]);

  const rows = data.map((s) => ({
    ...s.toObject(),
    cleanerResponse: cleanerResponseOf(s.status),
  }));

  return {
    data: rows,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
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
      .populate("accommodation", "name address city photos accommodationType surface floor numberOfRooms keys accessCode instructions cleaningRate")
      .populate("host", "firstName lastName name profileImage phone")
      .populate("assignment", "pricePerCleaning role")
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit),
    CleaningSchedule.countDocuments(filter),
  ]);

  const rows = data.map((s) => toMissionCard(s));

  return {
    data: rows,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Cleaner: Home (dashboard — today's cleaning + upcoming) ───────────────────
const ACCOMMODATION_CARD_FIELDS =
  "name address city photos accommodationType surface floor numberOfRooms cleaningRate";

// Payment is "paid" once the host has funded the escrow (paid_held) and stays
// paid after the payout is released to the cleaner (released).
const PAID_STATUSES = ["paid_held", "released"];

const getCleanerHome = async (cleanerId: string) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Active = anything the cleaner still has to act on / is working on
  const activeStatuses = [
    "scheduled",
    "accepted",
    "in_progress",
    "proof_submitted",
    "disputed",
  ];

  const [todayRows, upcomingRows, missionsToday, completedToday] =
    await Promise.all([
      // Today's cleaning — only after the host has paid (paid_held/released)
      CleaningSchedule.find({
        cleaner: cleanerId,
        date: { $gte: startOfToday, $lte: endOfToday },
        status: { $nin: ["refused", "cancelled"] },
        paymentStatus: { $in: PAID_STATUSES },
      })
        .populate("accommodation", ACCOMMODATION_CARD_FIELDS)
        .populate("host", "firstName lastName name profileImage phone")
        .populate("assignment", "pricePerCleaning role")
        .sort({ checkInTime: 1 }),

      // Upcoming tasks (future days, still active) — paid only
      CleaningSchedule.find({
        cleaner: cleanerId,
        date: { $gt: endOfToday },
        status: { $in: activeStatuses },
        paymentStatus: { $in: PAID_STATUSES },
      })
        .populate("accommodation", ACCOMMODATION_CARD_FIELDS)
        .populate("host", "firstName lastName name profileImage phone")
        .populate("assignment", "pricePerCleaning role")
        .sort({ date: 1, checkInTime: 1 })
        .limit(10),

      // Missions still to do today — paid + active
      CleaningSchedule.countDocuments({
        cleaner: cleanerId,
        date: { $gte: startOfToday, $lte: endOfToday },
        status: { $in: activeStatuses },
        paymentStatus: { $in: PAID_STATUSES },
      }),

      // Completed today = the cleaner has actually been paid out (released)
      CleaningSchedule.countDocuments({
        cleaner: cleanerId,
        date: { $gte: startOfToday, $lte: endOfToday },
        paymentStatus: "released",
      }),
    ]);

  return {
    summary: {
      date: dayKeyOf(startOfToday),
      missionsToday,
      completedToday,
    },
    todaysCleaning: todayRows.map((s) => toMissionCard(s)),
    upcomingTasks: upcomingRows.map((s) => toMissionCard(s)),
  };
};

// ─── Cleaner: Planning (calendar view — missions grouped by date) ──────────────
const getCleanerPlanning = async (
  cleanerId: string,
  query: Record<string, unknown>,
) => {
  // Range: explicit ?from&to, else a whole month (?month=YYYY-MM), else current month
  let from: Date;
  let to: Date;

  if (query.from && query.to) {
    from = new Date(String(query.from));
    from.setHours(0, 0, 0, 0);
    to = new Date(String(query.to));
    to.setHours(23, 59, 59, 999);
  } else {
    const base = query.month
      ? new Date(`${String(query.month)}-01T00:00:00`)
      : new Date();
    from = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const filter: any = {
    cleaner: cleanerId,
    date: { $gte: from, $lte: to },
    status: { $nin: ["cancelled"] },
  };
  if (query.status) filter.status = query.status;

  const schedules = await CleaningSchedule.find(filter)
    .populate("accommodation", ACCOMMODATION_CARD_FIELDS)
    .populate("host", "firstName lastName name profileImage phone")
    .populate("assignment", "pricePerCleaning role")
    .sort({ date: 1, checkInTime: 1 });

  const missions = schedules.map((s) => toMissionCard(s));

  // Group missions by day for the schedule list
  const groupMap = new Map<string, any>();
  // Per-day counts for the calendar strip dots/badges
  const dayCounts = new Map<string, number>();

  for (const mission of missions) {
    const key = mission.dayKey;
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        date: key,
        label: mission.dayLabel,
        count: 0,
        missions: [],
      });
    }
    const group = groupMap.get(key);
    group.count += 1;
    group.missions.push(mission);
  }

  return {
    range: { from: dayKeyOf(from), to: dayKeyOf(to) },
    days: Array.from(dayCounts, ([date, count]) => ({ date, count })),
    groups: Array.from(groupMap.values()),
  };
};

// ─── Single schedule (host or its cleaner) ────────────────────────────────────
const getScheduleById = async (userId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findById(scheduleId)
    .populate("accommodation")
    .populate("host", "firstName lastName name profileImage phone")
    .populate("cleaner", "firstName lastName name profileImage phone")
    .populate("assignment", "pricePerCleaning role");
  if (!schedule) throw new AppError(404, "Schedule not found");

  const host = schedule.host as any;
  const cleaner = schedule.cleaner as any;
  const isParty =
    String(host?._id || host) === userId ||
    String(cleaner?._id || cleaner) === userId;
  if (!isParty) throw new AppError(403, "You are not part of this schedule");

  // latest payment for this schedule
  const latestPayment = await Payment.findOne({ schedule: schedule._id })
    .sort({ createdAt: -1 })
    .select("status amount currency createdAt");

  // How much the host pays the cleaner for this job — same rule as the mission
  // cards: assignment.pricePerCleaning, falling back to accommodation.cleaningRate.
  const assignment = schedule.assignment as any;
  const accommodation = schedule.accommodation as any;
  const payAmount =
    (assignment && typeof assignment === "object"
      ? assignment.pricePerCleaning
      : undefined) ??
    (accommodation && typeof accommodation === "object"
      ? accommodation.cleaningRate
      : undefined) ??
    null;

  return {
    // Keep the schedule's own paymentStatus (escrow lifecycle: unpaid /
    // paid_held / released) from the spread below. Do NOT override it with the
    // Payment document's gateway status (pending / succeeded / …) — that's a
    // different field and is exposed separately as latestPayment.status. The
    // list endpoints return the schedule's paymentStatus, so this must match.
    ...schedule.toObject(),
    cleanerResponse: cleanerResponseOf(schedule.status),
    scheduleId: String(schedule._id),
    scheduleStatus: schedule.status,
    scheduleCleanerResponse: cleanerResponseOf(schedule.status),
    payAmount,
    payCurrency: PAY_CURRENCY,
    latestPayment: latestPayment
      ? {
          status: latestPayment.status,
          amount: latestPayment.amount,
          currency: latestPayment.currency,
          createdAt: latestPayment.createdAt,
        }
      : null,
  };
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

// ─── Host: invalidate the submitted proof (send back to the cleaner) ──────────
const invalidateProof = async (
  hostId: string,
  scheduleId: string,
  payload: { reason?: string },
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");

  if (schedule.status === "completed") {
    throw new AppError(
      400,
      "This task is already completed and can no longer be invalidated.",
    );
  }
  // The host can only reject work the cleaner has actually turned in.
  if (!["proof_submitted", "disputed"].includes(schedule.status)) {
    throw new AppError(
      400,
      "You can only invalidate a task after the cleaner has submitted proof.",
    );
  }

  // Send the job back to the cleaner to redo and resubmit. The escrow (paid_held)
  // stays untouched — funds are only released once the host validates. The job is
  // paid, so it returns to "in_progress" (not "accepted").
  schedule.status = "in_progress";
  schedule.invalidationReason = payload.reason;
  schedule.invalidatedAt = new Date();
  schedule.invalidationCount = (schedule.invalidationCount || 0) + 1;
  await schedule.save();

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.cleaner),
    title: "Cleaning not validated",
    message: `The host did not validate the cleaning for ${accName}${
      payload.reason ? `: ${payload.reason}` : ""
    }. Please review and resubmit your proof.`,
    type: "proof_submitted",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

export const ScheduleService = {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  respondToSchedule,
  getHostSchedules,
  getCleanerSchedules,
  getCleanerHome,
  getCleanerPlanning,
  getScheduleById,
  submitProof,
  reportDispute,
  completeTask,
  invalidateProof,
};
