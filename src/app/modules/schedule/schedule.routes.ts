import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { upload } from "../../middleware/multer";
import { ScheduleController } from "./schedule.controller";
import {
  createScheduleSchema,
  updateScheduleSchema,
  respondScheduleSchema,
} from "./schedule.validation";

const router = express.Router();

// ─── Host ─────────────────────────────────────────────────────────────────────

// POST /api/v1/schedule/:accommodationId — Proceed to Schedule
router.post(
  "/:accommodationId",
  auth("admin", "host"),
  validateRequest(createScheduleSchema),
  ScheduleController.createSchedule,
);

// GET /api/v1/schedule/host — host's schedules (?status&accommodationId&page&limit)
router.get("/host", auth("admin", "host"), ScheduleController.getHostSchedules);

// PATCH /api/v1/schedule/:id/complete — host completes/accepts the task
router.patch(
  "/:id/complete",
  auth("admin", "host"),
  ScheduleController.completeTask,
);

// PATCH /api/v1/schedule/:id — host edits a schedule (only before cleaner accepts)
router.patch(
  "/:id",
  auth("admin", "host"),
  validateRequest(updateScheduleSchema),
  ScheduleController.updateSchedule,
);

// DELETE /api/v1/schedule/:id — host deletes a schedule (only before cleaner accepts)
router.delete("/:id", auth("admin", "host"), ScheduleController.deleteSchedule);

// ─── Cleaner ──────────────────────────────────────────────────────────────────

// GET /api/v1/schedule/cleaner/home — cleaner dashboard (today's cleaning + upcoming)
router.get(
  "/cleaner/home",
  auth("cleaner"),
  ScheduleController.getCleanerHome,
);

// GET /api/v1/schedule/cleaner/planning — calendar view (?month=YYYY-MM | ?from&to | ?status)
router.get(
  "/cleaner/planning",
  auth("cleaner"),
  ScheduleController.getCleanerPlanning,
);

// GET /api/v1/schedule/cleaner — cleaner's schedules (?status&page&limit)
router.get("/cleaner", auth("cleaner"), ScheduleController.getCleanerSchedules);

// PATCH /api/v1/schedule/:id/respond — cleaner accept/refuse the schedule
router.patch(
  "/:id/respond",
  auth("cleaner"),
  validateRequest(respondScheduleSchema),
  ScheduleController.respondToSchedule,
);

// PATCH /api/v1/schedule/:id/submit-proof — cleaner submits proof (formdata: photos[])
router.patch(
  "/:id/submit-proof",
  auth("cleaner"),
  upload.array("photos", 10),
  ScheduleController.submitProof,
);

// PATCH /api/v1/schedule/:id/dispute — cleaner reports a dispute (formdata: photos[])
router.patch(
  "/:id/dispute",
  auth("cleaner"),
  upload.array("photos", 10),
  ScheduleController.reportDispute,
);

// ─── Shared ───────────────────────────────────────────────────────────────────

// GET /api/v1/schedule/:id — single schedule (host or its cleaner)
router.get("/:id", auth("admin", "host", "cleaner"), ScheduleController.getScheduleById);

export const ScheduleRoutes = router;
