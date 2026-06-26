import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { AssignmentController } from "./assignment.controller";
import {
  assignCleanerSchema,
  respondAssignmentSchema,
  changeRoleSchema,
} from "./assignment.validation";

const router = express.Router();

// ─── Cleaner discovery (host-facing) ──────────────────────────────────────────

// GET /api/v1/assignment/housekeepers — find a housekeeper (?search&interventionZone&page&limit)
router.get(
  "/housekeepers",
  auth("admin", "host"),
  AssignmentController.findHousekeepers,
);

// GET /api/v1/assignment/housekeepers/:cleanerId — single cleaner profile
router.get(
  "/housekeepers/:cleanerId",
  auth("admin", "host"),
  AssignmentController.getCleanerProfile,
);

// ─── Cleaner inbox ────────────────────────────────────────────────────────────

// GET /api/v1/assignment/my-requests — cleaner's incoming requests (?status&page&limit)
router.get(
  "/my-requests",
  auth("cleaner"),
  AssignmentController.getMyRequests,
);

// GET /api/v1/assignment/my-accommodations — cleaner's accepted accommodations
router.get(
  "/my-accommodations",
  auth("cleaner"),
  AssignmentController.getMyAccommodations,
);

// PATCH /api/v1/assignment/:assignmentId/respond — cleaner accept/refuse
router.patch(
  "/:assignmentId/respond",
  auth("cleaner"),
  validateRequest(respondAssignmentSchema),
  AssignmentController.respondToAssignment,
);

// ─── Host: manage assignments per accommodation ───────────────────────────────

// POST /api/v1/assignment/:accommodationId/assign — assign a cleaner
router.post(
  "/:accommodationId/assign",
  auth("admin", "host"),
  validateRequest(assignCleanerSchema),
  AssignmentController.assignCleaner,
);

// GET /api/v1/assignment/:accommodationId/cleaners — all assigned cleaners
router.get(
  "/:accommodationId/cleaners",
  auth("admin", "host"),
  AssignmentController.getAccommodationCleaners,
);

// PATCH /api/v1/assignment/:assignmentId/role — change primary/substitute
router.patch(
  "/:assignmentId/role",
  auth("admin", "host"),
  validateRequest(changeRoleSchema),
  AssignmentController.changeRole,
);

// DELETE /api/v1/assignment/:assignmentId — remove a cleaner
router.delete(
  "/:assignmentId",
  auth("admin", "host"),
  AssignmentController.removeAssignment,
);

export const AssignmentRoutes = router;
