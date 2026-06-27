import cron from "node-cron";
import { CalendarService } from "../modules/calendar/calendar.service";

// Periodically re-fetch every active iCal feed so imported bookings stay fresh.
// Runs hourly; one bad feed never throws (syncConnection swallows its own error).
export const startCalendarSync = () => {
  cron.schedule("0 * * * *", async () => {
    try {
      const result = await CalendarService.syncAllActive();
      console.log(`🔄 iCal sync: refreshed ${result.connections} connection(s)`);
    } catch (err) {
      console.error("⚠️ iCal sync failed:", (err as Error).message);
    }
  });

  console.log("🗓️  Calendar auto-sync scheduled (hourly)");
};
