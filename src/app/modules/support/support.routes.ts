import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { SupportController } from "./support.controller";
import {
  createTicketSchema,
  updateTicketSchema,
} from "./support.validation";

const router = express.Router();

// POST /api/v1/support — submit a Help & Support request (any logged-in user)
router.post(
  "/",
  auth("admin", "host", "cleaner"),
  validateRequest(createTicketSchema),
  SupportController.createTicket,
);

// GET /api/v1/support — admin: list tickets (?status&page&limit)
router.get("/", auth("admin"), SupportController.getAllTickets);

// PATCH /api/v1/support/:id — admin: update status (open/resolved)
router.patch(
  "/:id",
  auth("admin"),
  validateRequest(updateTicketSchema),
  SupportController.updateTicketStatus,
);

export const SupportRoutes = router;
