// utils/timezone.utils.ts

import { AsyncLocalStorage } from "async_hooks";
import moment from "moment-timezone";

// ─── Request-scoped timezone ───────────────────────────────────────────────────
// The x-timezone middleware stores the viewer's IANA timezone here for the
// lifetime of the request. Date helpers read it via getTimezone() so we don't
// have to thread `tz` through every controller/service signature. Outside a
// request (e.g. background jobs) it falls back to UTC.
export const requestContext = new AsyncLocalStorage<{ timezone: string }>();

export const getTimezone = (): string =>
  requestContext.getStore()?.timezone ?? "UTC";

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

export class TimezoneUtils {
  /**
   * Validate an IANA timezone string (e.g. "Europe/Paris").
   */
  static isValidTimezone(timezone: string): boolean {
    return !!timezone && moment.tz.zone(timezone) !== null;
  }

  /**
   * "Wednesday 15 May" — day label in the viewer's timezone (matches the
   * planning UI). Defaults to the current request's timezone.
   */
  static dayLabel(date: Date | string, tz: string = getTimezone()): string {
    const m = moment.tz(date, tz);
    return `${WEEKDAYS[m.day()]} ${m.date()} ${MONTHS[m.month()]}`;
  }

  /**
   * "2024-05-15" grouping key (calendar dots) in the viewer's timezone.
   */
  static dayKey(date: Date | string, tz: string = getTimezone()): string {
    return moment.tz(date, tz).format("YYYY-MM-DD");
  }

  /**
   * Start/end (UTC instants) of the calendar day that `date` falls on, as seen
   * in the viewer's timezone. Used for same-day range queries against the DB.
   */
  static dayRange(
    date: Date | string,
    tz: string = getTimezone(),
  ): { start: Date; end: Date } {
    const base = moment.tz(date, tz);
    return {
      start: base.clone().startOf("day").toDate(),
      end: base.clone().endOf("day").toDate(),
    };
  }

  /**
   * Start/end (UTC instants) of "today" in the viewer's timezone.
   */
  static todayRange(tz: string = getTimezone()): { start: Date; end: Date } {
    const now = moment.tz(tz);
    return {
      start: now.clone().startOf("day").toDate(),
      end: now.clone().endOf("day").toDate(),
    };
  }

  /**
   * Start/end (UTC instants) of a month, in the viewer's timezone.
   * @param month "YYYY-MM" (defaults to the current month in `tz`)
   */
  static monthRange(
    month?: string,
    tz: string = getTimezone(),
  ): { start: Date; end: Date } {
    const base = month
      ? moment.tz(month, "YYYY-MM", tz)
      : moment.tz(tz);
    return {
      start: base.clone().startOf("month").toDate(),
      end: base.clone().endOf("month").toDate(),
    };
  }

  /**
   * Parse a "YYYY-MM-DD" (or ISO) date string as midnight in the viewer's
   * timezone and return the absolute UTC instant to store. Prevents a France
   * "2024-05-15" from shifting to the previous day.
   */
  static parseDateInTz(
    dateStr: string,
    tz: string = getTimezone(),
  ): Date {
    // moment(dateStr, tz) accepts full ISO too; startOf('day') anchors the day.
    return moment.tz(dateStr, tz).startOf("day").toDate();
  }

  /**
   * Human date string ("Wed May 15 2024") in the viewer's timezone — replaces
   * server-local Date.toDateString() in notification messages.
   */
  static dateString(date: Date | string, tz: string = getTimezone()): string {
    return moment.tz(date, tz).format("ddd MMM DD YYYY");
  }

  /**
   * First/last day (UTC instants) of the current year-to-date etc. helpers can
   * be added here as needed.
   */
  static startOfDay(date: Date | string, tz: string = getTimezone()): Date {
    return moment.tz(date, tz).startOf("day").toDate();
  }

  static endOfDay(date: Date | string, tz: string = getTimezone()): Date {
    return moment.tz(date, tz).endOf("day").toDate();
  }

  /**
   * "HH:mm" wall-clock in the viewer's timezone.
   */
  static hhmm(date: Date | string, tz: string = getTimezone()): string {
    return moment.tz(date, tz).format("HH:mm");
  }

  /**
   * Current { year, month(1-12) } as seen in the viewer's timezone — used to
   * default a month view to "this month" in the viewer's local calendar.
   */
  static currentYearMonth(tz: string = getTimezone()): {
    year: number;
    month: number;
  } {
    const now = moment.tz(tz);
    return { year: now.year(), month: now.month() + 1 };
  }

  /**
   * Start (UTC instant) of a month given separate 1-12 month + year, in `tz`.
   * Returns { start, endExclusive } where endExclusive is the 1st of next month.
   */
  static monthBoundsExclusive(
    year: number,
    month: number,
    tz: string = getTimezone(),
  ): { start: Date; endExclusive: Date } {
    const start = moment.tz({ year, month: month - 1, day: 1 }, tz).startOf("day");
    return {
      start: start.toDate(),
      endExclusive: start.clone().add(1, "month").toDate(),
    };
  }
}
