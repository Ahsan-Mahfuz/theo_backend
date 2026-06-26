import express from "express";
import { auth } from "../../middleware/auth";
import { NotificationController } from "./notification.controller";

const router = express.Router();

// GET /api/v1/notification — my notifications (?page&limit&isRead)
router.get("/", auth(), NotificationController.getMyNotifications);

// PATCH /api/v1/notification/read-all — mark all as read
router.patch("/read-all", auth(), NotificationController.markAllAsRead);

// PATCH /api/v1/notification/:id/read — mark one as read
router.patch("/:id/read", auth(), NotificationController.markAsRead);

export const NotificationRoutes = router;
