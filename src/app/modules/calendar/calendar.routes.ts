import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { CalendarController } from "./calendar.controller";
import { addConnectionSchema } from "./calendar.validation";

const router = express.Router();

// ─── iCal connections ───────────────────────────────────────────────────────────

// GET /api/v1/calendar/:accommodationId/connections — list connected iCal feeds
router.get(
  "/:accommodationId/connections",
  auth("admin", "host"),
  CalendarController.listConnections,
);

// POST /api/v1/calendar/:accommodationId/connections — connect a new iCal URL
router.post(
  "/:accommodationId/connections",
  auth("admin", "host"),
  validateRequest(addConnectionSchema),
  CalendarController.addConnection,
);

// DELETE /api/v1/calendar/connections/:connectionId — remove a connection
router.delete(
  "/connections/:connectionId",
  auth("admin", "host"),
  CalendarController.removeConnection,
);

// POST /api/v1/calendar/:accommodationId/sync — manual "refresh now"
router.post(
  "/:accommodationId/sync",
  auth("admin", "host"),
  CalendarController.syncAccommodation,
);

// ─── Views ──────────────────────────────────────────────────────────────────────

// GET /api/v1/calendar/:accommodationId/month?year=&month= — calendar aggregation
router.get(
  "/:accommodationId/month",
  auth("admin", "host"),
  CalendarController.getMonthCalendar,
);

// GET /api/v1/calendar/:accommodationId/list?year=&month= — list view
router.get(
  "/:accommodationId/list",
  auth("admin", "host"),
  CalendarController.getList,
);

export const CalendarRoutes = router;
