import express from "express";
import { auth } from "../../middleware/auth";
import { AdminController } from "./admin.controller";

const router = express.Router();

// Everything here is admin-only.

// GET /api/v1/admin/dashboard?range=this_month|all
router.get("/dashboard", auth("admin"), AdminController.getDashboard);

// GET /api/v1/admin/hosts?search&page&limit
router.get("/hosts", auth("admin"), AdminController.getHosts);
// GET /api/v1/admin/hosts/:id
router.get("/hosts/:id", auth("admin"), AdminController.getHostById);

// GET /api/v1/admin/cleaners?search&page&limit
router.get("/cleaners", auth("admin"), AdminController.getCleaners);
// GET /api/v1/admin/cleaners/:id
router.get("/cleaners/:id", auth("admin"), AdminController.getCleanerById);

// GET /api/v1/admin/schedules?status&paymentStatus&page&limit
router.get("/schedules", auth("admin"), AdminController.getSchedules);

// GET /api/v1/admin/transactions?status&page&limit
router.get("/transactions", auth("admin"), AdminController.getTransactions);

// PATCH /api/v1/admin/users/:id/block  { block: true|false }
router.patch("/users/:id/block", auth("admin"), AdminController.setUserBlocked);

export const AdminRoutes = router;
