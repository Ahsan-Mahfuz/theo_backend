/* eslint-disable @typescript-eslint/no-explicit-any */
import { Accommodation } from "./accommodation.model";
import { IAccommodation, TAccommodationStatus } from "./accommodation.interface";
import AppError from "../../error/appError";
import { User } from "../user/user.model";
import { CleanerAssignment } from "../assignment/assignment.model";
import { Payment } from "../payment/payment.model";
import { CleaningSchedule } from "../schedule/schedule.model";
import { Booking, CalendarConnection } from "../calendar/calendar.model";

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

// ─── Shared listing (filter + pagination + host annotations) ──────────────────
// Backs getMyAccommodations and the two lifecycle-scoped endpoints (housing /
// planning). Pass opts.status to lock the list to a lifecycle stage; otherwise
// the raw ?status query param (scheduled | not_scheduled) is honoured.

const listHostAccommodations = async (
  hostId: string,
  query: Record<string, unknown>,
  opts: {
    status?: TAccommodationStatus;
    onlyAssigned?: boolean;
    onlyUnassigned?: boolean;
  } = {},
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { host: hostId, isDeleted: false };

  // Lifecycle stage is locked by the caller (housing / planning); otherwise the
  // raw ?status query param applies.
  if (opts.status) {
    filter.status = opts.status;
  } else if (query.status) {
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

  // Accommodation ids that have an ACCEPTED cleaner (for this host)
  const assignedIds = (
    await CleanerAssignment.distinct("accommodation", {
      host: hostId,
      status: "accepted",
    })
  ).map(String);

  // Accommodation ids that have ANY cleaner assignment (pending/accepted/refused).
  // Used only by the ?cleanerStage sub-filter below.
  const anyAssignedIds = (
    await CleanerAssignment.distinct("accommodation", { host: hostId })
  ).map(String);

  // The Housing ↔ Planning boundary is an ACCEPTED cleaner (assignedIds):
  //   no accepted cleaner → Housing (created, still requesting / awaiting accept)
  //   ≥ 1 accepted cleaner → Planning (full lifecycle tracking)
  // A pending request keeps the accommodation in Housing until the cleaner
  // accepts; removing the accepted cleaner drops it back into Housing.
  if (opts.onlyUnassigned) {
    filter._id = { $nin: assignedIds };
  } else if (opts.onlyAssigned) {
    filter._id = { $in: assignedIds };
  } else if (query.cleanerStage) {
    // Filter by the cleaner-assignment sub-stage:
    //   new      → no cleaner requested yet
    //   assigned → a cleaner was requested but hasn't accepted
    //   accepted → a cleaner accepted the request
    const stage = String(query.cleanerStage);
    if (stage === "accepted") {
      filter._id = { $in: assignedIds };
    } else if (stage === "assigned") {
      const pendingIds = anyAssignedIds.filter(
        (id) => !assignedIds.includes(id),
      );
      filter._id = { $in: pendingIds };
    } else if (stage === "new") {
      filter._id = { $nin: anyAssignedIds };
    }
  } else if (query.isCleanerAssigned !== undefined) {
    // Filter by whether a cleaner is assigned (accepted)
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
    const id = String(a._id);
    const latestSchedule = scheduleByAccommodation.get(id);
    const cleaners = cleanersByAccommodation.get(id) ?? [];
    // Cleaner-assignment sub-stage (housing view): new → assigned → accepted
    const cleanerStage = assignedIds.includes(id)
      ? "accepted"
      : cleaners.length
        ? "assigned"
        : "new";
    return {
      ...a.toObject(),
      isCleanerAssigned: assignedIds.includes(String(a._id)),
      cleanerStage,
      assignedCleaners: cleaners,
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

// ─── Get My Accommodations (with filter + pagination) ─────────────────────────
// Unchanged behaviour: honours ?status, ?isCleanerAssigned, ?city, ?search, etc.

const getMyAccommodations = async (
  hostId: string,
  query: Record<string, unknown>,
) => listHostAccommodations(hostId, query);

// ─── Housing: created + cleaner-assignment stage (not scheduled yet) ──────────
// "accommodation created + cleaner assigned/not". Combine with
// ?isCleanerAssigned=true/false to split assigned vs no-cleaner.

const getHousingAccommodations = async (
  hostId: string,
  query: Record<string, unknown>,
) => listHostAccommodations(hostId, query, { onlyUnassigned: true });

// ─── Planning: from cleaner acceptance → completion (all active data) ─────────
// Entry point is an ACCEPTED cleaner assignment (not merely a created listing).
// For each such accommodation we return the FULL chain the host cares about:
// the accepted cleaner → every schedule (with its cleaner response, in-progress
// / proof / completion / dispute state) → the payment tied to each schedule.

const PLANNING_STEPS = [
  "scheduled",
  "accepted",
  "in_progress",
  "proof_submitted",
  "completed",
] as const;

// How far along the schedule is (0 = just sent … 5 = completed); refused /
// cancelled / disputed are terminal branches, not points on the happy path.
const scheduleProgress = (status: string): number => {
  if (status === "completed") return 5;
  const idx = PLANNING_STEPS.indexOf(status as any);
  return idx >= 0 ? idx + 1 : 0;
};

// Full schedule chain for a set of accommodations: each schedule with its
// cleaner, progress/response, proof/dispute state and the payment tied to it.
// Returned newest-cleaning-first; each item keeps its `accommodation` id so the
// caller can group by accommodation.
const fetchScheduleChain = async (match: Record<string, unknown>) => {
  const schedules = await CleaningSchedule.find(match)
    .populate("cleaner", "firstName lastName name profileImage")
    .sort({ date: -1, createdAt: -1 });

  const scheduleIds = schedules.map((s) => s._id);
  const payments = await Payment.find({
    schedule: { $in: scheduleIds },
  }).select(
    "schedule status amount currency platformFee cleanerAmount createdAt",
  );

  const paymentBySchedule = new Map<string, any>();
  for (const p of payments) {
    paymentBySchedule.set(String(p.schedule), {
      paymentId: p._id,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      platformFee: p.platformFee,
      cleanerAmount: p.cleanerAmount,
      createdAt: p.createdAt,
    });
  }

  return (schedules as any[]).map((s) => ({
    accommodation: String(s.accommodation),
    scheduleId: s._id,
    cleaner: s.cleaner,
    date: s.date,
    checkInTime: s.checkInTime,
    checkOutTime: s.checkOutTime,
    notes: s.notes,
    status: s.status,
    statusLabel: scheduleEventLabel(s.status),
    cleanerResponse: cleanerResponseOf(s.status),
    progress: scheduleProgress(s.status),
    paymentStatus: s.paymentStatus,
    proofPhotos: s.proofPhotos ?? [],
    proofNotes: s.proofNotes ?? null,
    proofSubmittedAt: s.proofSubmittedAt ?? null,
    dispute: s.dispute ?? null,
    completedAt: s.completedAt ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    payment: paymentBySchedule.get(String(s._id)) ?? null,
  }));
};

// ─── Planning: "Connect my calendars" list ────────────────────────────────────
// Backs the Calendar screen's left rail: only accommodations that have at least
// one cleaner assigned (the Housing → Planning boundary), each annotated with
// its connected iCal feeds (Airbnb / Booking.com / Vrbo / …) so the UI can show
// the per-platform connection + last-sync state. Honours the shared
// ?accommodationType / ?city / ?search / ?page / ?limit query params.

const getPlanningAccommodations = async (
  hostId: string,
  query: Record<string, unknown>,
) => {
  const base = await listHostAccommodations(hostId, query, {
    onlyAssigned: true,
  });

  const pageIds = base.data.map((a: any) => a._id);
  if (pageIds.length === 0) return base;

  const connections = await CalendarConnection.find({
    host: hostId,
    accommodation: { $in: pageIds },
  })
    .select(
      "accommodation platform label icalUrl isActive lastSyncedAt lastSyncStatus lastSyncError",
    )
    .sort({ createdAt: 1 });

  // group the iCal connections per accommodation
  const connectionsByAccommodation = new Map<string, any[]>();
  for (const c of connections) {
    const key = String(c.accommodation);
    if (!connectionsByAccommodation.has(key)) {
      connectionsByAccommodation.set(key, []);
    }
    connectionsByAccommodation.get(key)!.push({
      connectionId: c._id,
      platform: c.platform,
      label: c.label ?? null,
      icalUrl: c.icalUrl,
      isActive: c.isActive,
      lastSyncedAt: c.lastSyncedAt ?? null,
      lastSyncStatus: c.lastSyncStatus ?? null,
      lastSyncError: c.lastSyncError ?? null,
    });
  }

  const data = base.data.map((a: any) => ({
    ...a,
    connections: connectionsByAccommodation.get(String(a._id)) ?? [],
  }));

  return { data, meta: base.meta };
};

// ─── Host dashboard: recommended_schedule (iCal turnovers) + to_do (activity) ──
const RECOMMENDATION_LIMIT = 3;
const CLEANER_CARD_FIELDS = "firstName lastName name profileImage";
const ACC_CARD_FIELDS = "name address city photos accommodationType";

// "HH:mm" (server local time) from a Date
const hhmm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;

// "YYYY-MM-DD" day key (server local time)
const dayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Host-facing label for a cleaning schedule's current status
const scheduleEventLabel = (status: string): string => {
  switch (status) {
    case "scheduled": return "Schedule sent to cleaner";
    case "accepted": return "Cleaner accepted the schedule";
    case "refused": return "Refused the mission";
    case "in_progress": return "Cleaning in progress";
    case "proof_submitted": return "Proof submitted";
    case "completed": return "Cleaning completed";
    case "disputed": return "Dispute reported";
    case "cancelled": return "Schedule cancelled";
    default: return status;
  }
};

// The timestamp that best represents *when* a schedule reached its current status
const scheduleEventTime = (s: any): Date => {
  switch (s.status) {
    case "scheduled": return s.createdAt;
    case "proof_submitted": return s.proofSubmittedAt || s.updatedAt;
    case "completed": return s.completedAt || s.updatedAt;
    case "disputed": return s.dispute?.raisedAt || s.updatedAt;
    default: return s.updatedAt;
  }
};

// Host-facing label for an assignment request's status
const assignmentEventLabel = (status: string): string => {
  switch (status) {
    case "pending": return "Request sent to cleaner";
    case "accepted": return "Cleaner accepted your request";
    case "refused": return "Cleaner refused your request";
    default: return status;
  }
};

// Build the full, sorted list of recommended cleanings for a host. Shared by
// the dashboard home (sliced to the top few) and the paginated "see all" page.
const buildRecommendations = async (
  hostId: string,
  accById: Map<string, any>,
): Promise<any[]> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const accIds = [...accById.keys()];

  // Only accommodations with an ACCEPTED PRIMARY cleaner qualify (we show that
  // cleaner on the card). For each, find iCal "turnovers": the free window
  // between one guest's checkout and the next guest's check-in.
  const primaryAssignments = await CleanerAssignment.find({
    host: hostId,
    accommodation: { $in: accIds },
    role: "primary",
    status: "accepted",
  }).populate("cleaner", CLEANER_CARD_FIELDS);

  const cleanerByAcc = new Map<string, any>();
  for (const a of primaryAssignments) {
    cleanerByAcc.set(String(a.accommodation), a.cleaner);
  }
  const eligibleAccIds = [...cleanerByAcc.keys()];

  // future (non-cancelled) bookings for eligible accommodations
  const bookings = eligibleAccIds.length
    ? await Booking.find({
        accommodation: { $in: eligibleAccIds },
        isCancelled: false,
        endDate: { $gte: todayStart },
      }).sort({ accommodation: 1, startDate: 1 })
    : [];

  const bookingsByAcc = new Map<string, any[]>();
  for (const b of bookings) {
    const key = String(b.accommodation);
    if (!bookingsByAcc.has(key)) bookingsByAcc.set(key, []);
    bookingsByAcc.get(key)!.push(b);
  }

  // existing cleanings so we don't recommend a turnover that's already handled
  const existing = eligibleAccIds.length
    ? await CleaningSchedule.find({
        host: hostId,
        accommodation: { $in: eligibleAccIds },
        status: { $nin: ["refused", "cancelled"] },
        date: { $gte: todayStart },
      }).select("accommodation date booking")
    : [];

  const scheduledDays = new Map<string, Set<string>>(); // accId -> {dayKey}
  const scheduledBookings = new Set<string>();
  for (const s of existing) {
    const accKey = String(s.accommodation);
    if (!scheduledDays.has(accKey)) scheduledDays.set(accKey, new Set());
    scheduledDays.get(accKey)!.add(dayKey(new Date(s.date)));
    if (s.booking) scheduledBookings.add(String(s.booking));
  }

  const recommendations: any[] = [];
  for (const [accKey, list] of bookingsByAcc) {
    const accDoc: any = accById.get(accKey);
    if (!accDoc) continue;

    for (let i = 0; i < list.length; i++) {
      const current = list[i];
      const next = list[i + 1]; // the booking that bounds the free window (if any)
      const checkout = new Date(current.endDate);
      if (checkout < todayStart) continue;

      const freeUntil = next ? new Date(next.startDate) : null;
      // a real free window must exist (next guest arrives after checkout)
      if (freeUntil && freeUntil <= checkout) continue;

      // skip if this booking or the checkout day already has a cleaning
      if (scheduledBookings.has(String(current._id))) continue;
      if (scheduledDays.get(accKey)?.has(dayKey(checkout))) continue;

      recommendations.push({
        accommodation: {
          _id: accDoc._id,
          name: accDoc.name,
          address: accDoc.address,
          city: accDoc.city,
          photos: accDoc.photos,
          accommodationType: accDoc.accommodationType,
        },
        cleaner: cleanerByAcc.get(accKey) ?? null,
        recommendedDate: checkout,
        freeFrom: checkout,
        freeUntil,
        checkInTime: hhmm(checkout),
        checkOutTime: freeUntil ? hhmm(freeUntil) : null,
        booking: {
          _id: current._id,
          summary: current.summary,
          platform: current.platform,
          startDate: current.startDate,
          endDate: current.endDate,
        },
      });
    }
  }

  recommendations.sort(
    (a, b) =>
      new Date(a.recommendedDate).getTime() -
      new Date(b.recommendedDate).getTime(),
  );

  return recommendations;
};

const getHostDashboard = async (
  hostId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const accommodations = await Accommodation.find({
    host: hostId,
    isDeleted: false,
  });
  const accIds = accommodations.map((a) => a._id);
  const accById = new Map(accommodations.map((a) => [String(a._id), a]));

  // ── recommended_schedule (top few for the home cards) ───────────────────────
  const recommendations = await buildRecommendations(hostId, accById);
  const recommended_schedule = recommendations.slice(0, RECOMMENDATION_LIMIT);

  // ── to_do: unified activity feed (newest first, paginated) ──────────────────
  // Every host-facing interaction on their accommodations: assignment responses
  // and cleaning-schedule status changes (accepted/refused/completed/dispute…).
  const [schedules, assignments] = await Promise.all([
    CleaningSchedule.find({ host: hostId, accommodation: { $in: accIds } })
      .populate("cleaner", CLEANER_CARD_FIELDS)
      .populate("accommodation", ACC_CARD_FIELDS),
    CleanerAssignment.find({ host: hostId, accommodation: { $in: accIds } })
      .populate("cleaner", CLEANER_CARD_FIELDS)
      .populate("accommodation", ACC_CARD_FIELDS),
  ]);

  // Only surface entries where the CLEANER has interacted — skip host-initiated
  // states that are still waiting on the cleaner (schedule "scheduled" /
  // "cancelled", assignment "pending").
  const CLEANER_SCHEDULE_STATUSES = new Set([
    "accepted",
    "refused",
    "in_progress",
    "proof_submitted",
    "completed",
    "disputed",
  ]);
  const CLEANER_ASSIGNMENT_STATUSES = new Set(["accepted", "refused"]);

  const events: any[] = [];
  for (const s of schedules) {
    if (!CLEANER_SCHEDULE_STATUSES.has(s.status)) continue;
    events.push({
      kind: "schedule",
      scheduleId: String(s._id),
      status: s.status,
      label: scheduleEventLabel(s.status),
      timestamp: scheduleEventTime(s),
      accommodation: s.accommodation,
      cleaner: s.cleaner,
    });
  }
  for (const a of assignments) {
    if (!CLEANER_ASSIGNMENT_STATUSES.has(a.status)) continue;
    events.push({
      kind: "assignment",
      assignmentId: String(a._id),
      status: a.status,
      label: assignmentEventLabel(a.status),
      timestamp: a.respondedAt || a.createdAt,
      accommodation: a.accommodation,
      cleaner: a.cleaner,
    });
  }

  events.sort(
    (x, y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime(),
  );

  const total = events.length;
  const data = events.slice(skip, skip + limit);

  return {
    recommended_schedule,
    recommended_total: recommendations.length,
    to_do: {
      data,
      meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
    },
  };
};

// ─── Recommended schedule: full paginated list ("see all" page) ───────────────

const getRecommendedSchedules = async (
  hostId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const accommodations = await Accommodation.find({
    host: hostId,
    isDeleted: false,
  });
  const accById = new Map(accommodations.map((a) => [String(a._id), a]));

  const recommendations = await buildRecommendations(hostId, accById);

  const total = recommendations.length;
  const data = recommendations.slice(skip, skip + limit);

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

  // Full chain: every schedule created for this accommodation (newest first),
  // each with its cleaner, progress/response, proof/dispute and payment.
  const schedules = await fetchScheduleChain({
    host: hostId,
    accommodation: accommodationId,
  });

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
    schedules,
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
  getHousingAccommodations,
  getPlanningAccommodations,
  getHostDashboard,
  getRecommendedSchedules,
  getAccommodationById,
  getAccommodationForCleaner,
  updateAccommodation,
  deleteAccommodation,
};
