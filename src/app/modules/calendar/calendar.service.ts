/* eslint-disable @typescript-eslint/no-explicit-any */
import * as ical from "node-ical";
import { Booking, CalendarConnection } from "./calendar.model";
import { Accommodation } from "../accommodation/accommodation.model";
import { CleaningSchedule } from "../schedule/schedule.model";
import { TPlatform } from "./calendar.interface";
import AppError from "../../error/appError";

// ─── helpers ────────────────────────────────────────────────────────────────────

// Confirm the host owns the (non-deleted) accommodation, mirroring the check
// used across accommodation/schedule services.
const ensureOwnership = async (hostId: string, accommodationId: string) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  });
  if (!accommodation) throw new AppError(404, "Accommodation not found");
  return accommodation;
};

// ─── Sync a single connection's iCal feed into Booking rows ──────────────────────
const syncConnection = async (connectionId: string) => {
  const connection = await CalendarConnection.findById(connectionId);
  if (!connection) throw new AppError(404, "Calendar connection not found");

  try {
    const events = await ical.async.fromURL(connection.icalUrl);

    const seenUids: string[] = [];

    for (const key of Object.keys(events)) {
      const event = events[key] as any;
      if (event.type !== "VEVENT" || !event.start || !event.end) continue;

      const uid = String(event.uid || key);
      seenUids.push(uid);

      await Booking.updateOne(
        { connection: connection._id, uid },
        {
          $set: {
            accommodation: connection.accommodation,
            host: connection.host,
            platform: connection.platform,
            summary: event.summary,
            startDate: new Date(event.start),
            endDate: new Date(event.end),
            isCancelled: false,
          },
        },
        { upsert: true },
      );
    }

    // Anything previously imported but no longer in the feed is cancelled.
    await Booking.updateMany(
      { connection: connection._id, uid: { $nin: seenUids } },
      { $set: { isCancelled: true } },
    );

    connection.lastSyncedAt = new Date();
    connection.lastSyncStatus = "success";
    connection.lastSyncError = undefined;
    await connection.save();

    return { synced: seenUids.length };
  } catch (err) {
    connection.lastSyncedAt = new Date();
    connection.lastSyncStatus = "failed";
    connection.lastSyncError = (err as Error).message;
    await connection.save();
    return { synced: 0, error: (err as Error).message };
  }
};

// ─── Host: add an iCal connection (then sync it immediately) ─────────────────────
const addConnection = async (
  hostId: string,
  accommodationId: string,
  payload: { platform?: TPlatform; label?: string; icalUrl: string },
) => {
  await ensureOwnership(hostId, accommodationId);

  const connection = await CalendarConnection.create({
    accommodation: accommodationId,
    host: hostId,
    platform: payload.platform || "other",
    label: payload.label,
    icalUrl: payload.icalUrl,
  });

  // Fetch right away so the calendar shows bookings without waiting for cron.
  await syncConnection(String(connection._id));

  return CalendarConnection.findById(connection._id);
};

// ─── Host: list connections for an accommodation ─────────────────────────────────
const listConnections = async (hostId: string, accommodationId: string) => {
  await ensureOwnership(hostId, accommodationId);
  return CalendarConnection.find({
    accommodation: accommodationId,
    host: hostId,
  }).sort({ createdAt: 1 });
};

// ─── Host: remove a connection (and its imported bookings) ───────────────────────
const removeConnection = async (hostId: string, connectionId: string) => {
  const connection = await CalendarConnection.findOne({
    _id: connectionId,
    host: hostId,
  });
  if (!connection) throw new AppError(404, "Calendar connection not found");

  await Booking.deleteMany({ connection: connection._id });
  await connection.deleteOne();

  return { message: "Calendar connection removed" };
};

// ─── Host: refresh now — sync all active connections of an accommodation ──────────
const syncAccommodation = async (hostId: string, accommodationId: string) => {
  await ensureOwnership(hostId, accommodationId);

  const connections = await CalendarConnection.find({
    accommodation: accommodationId,
    host: hostId,
    isActive: true,
  });

  for (const connection of connections) {
    await syncConnection(String(connection._id));
  }

  return { message: "Calendars refreshed", connections: connections.length };
};

// ─── Host: month view — bookings (gray) + cleaner schedules combined ──────────────
const getMonthCalendar = async (
  hostId: string,
  accommodationId: string,
  query: Record<string, unknown>,
) => {
  await ensureOwnership(hostId, accommodationId);

  const now = new Date();
  const year = Number(query.year) || now.getFullYear();
  const month = Number(query.month) || now.getMonth() + 1; // 1-12

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1); // exclusive (1st of next month)

  // Bookings overlapping the month: start before month-end AND end at/after month-start.
  const bookings = await Booking.find({
    accommodation: accommodationId,
    isCancelled: false,
    startDate: { $lt: monthEnd },
    endDate: { $gte: monthStart },
  }).sort({ startDate: 1 });

  // Cleaner schedules whose date falls in the month.
  const schedules = await CleaningSchedule.find({
    accommodation: accommodationId,
    date: { $gte: monthStart, $lt: monthEnd },
  })
    .populate("cleaner", "firstName lastName name profileImage")
    .sort({ date: 1 });

  return {
    year,
    month,
    bookings: bookings.map((b) => ({
      _id: b._id,
      platform: b.platform,
      summary: b.summary,
      startDate: b.startDate,
      endDate: b.endDate,
    })),
    schedules: schedules.map((s) => ({
      _id: s._id,
      date: s.date,
      checkInTime: s.checkInTime,
      checkOutTime: s.checkOutTime,
      status: s.status,
      paymentStatus: s.paymentStatus,
      booking: s.booking,
      cleaner: s.cleaner,
    })),
  };
};

// ─── Host: list view — each booking + whether a cleaning is scheduled ─────────────
const getList = async (
  hostId: string,
  accommodationId: string,
  query: Record<string, unknown>,
) => {
  await ensureOwnership(hostId, accommodationId);

  const now = new Date();
  const year = Number(query.year) || now.getFullYear();
  const month = Number(query.month) || now.getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const bookings = await Booking.find({
    accommodation: accommodationId,
    isCancelled: false,
    startDate: { $lt: monthEnd },
    endDate: { $gte: monthStart },
  }).sort({ startDate: 1 });

  // Pull the schedules linked to these bookings in one query.
  const bookingIds = bookings.map((b) => b._id);
  const schedules = await CleaningSchedule.find({
    accommodation: accommodationId,
    booking: { $in: bookingIds },
  }).populate("cleaner", "firstName lastName name profileImage");

  const scheduleByBooking = new Map<string, any>();
  for (const s of schedules) {
    if (s.booking) scheduleByBooking.set(String(s.booking), s);
  }

  return {
    year,
    month,
    items: bookings.map((b) => {
      const schedule = scheduleByBooking.get(String(b._id));
      return {
        booking: {
          _id: b._id,
          platform: b.platform,
          summary: b.summary,
          startDate: b.startDate,
          endDate: b.endDate,
        },
        isScheduled: Boolean(schedule),
        schedule: schedule
          ? {
              _id: schedule._id,
              date: schedule.date,
              checkInTime: schedule.checkInTime,
              checkOutTime: schedule.checkOutTime,
              status: schedule.status,
              paymentStatus: schedule.paymentStatus,
              cleaner: schedule.cleaner,
            }
          : null,
      };
    }),
  };
};

// ─── Cron helper: sync every active connection across all hosts ───────────────────
const syncAllActive = async () => {
  const connections = await CalendarConnection.find({ isActive: true }).select("_id");
  for (const connection of connections) {
    await syncConnection(String(connection._id));
  }
  return { connections: connections.length };
};

export const CalendarService = {
  addConnection,
  listConnections,
  removeConnection,
  syncConnection,
  syncAccommodation,
  getMonthCalendar,
  getList,
  syncAllActive,
};
