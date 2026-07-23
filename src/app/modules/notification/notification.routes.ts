import express from "express";
import { auth } from "../../middleware/auth";
import { NotificationController } from "./notification.controller";

const router = express.Router();

// GET /api/v1/notification — my notifications (?page&limit&isRead&type)
router.get("/", auth(), NotificationController.getMyNotifications);

// GET /api/v1/notification/fn — get notifications in French
router.get("/fn", auth(), NotificationController.getFrenchNotifications);

// GET /api/v1/notification/fr — alias to get notifications in French
router.get("/fr", auth(), NotificationController.getFrenchNotifications);

// POST /api/v1/notification — create a notification with title/message and titleFr/messageFr
router.post("/", auth(), NotificationController.createNotification);

// GET /api/v1/notification/unread-count — badge count for the bell
router.get("/unread-count", auth(), NotificationController.getUnreadCount);

// PATCH /api/v1/notification/read-all — mark all as read
router.patch("/read-all", auth(), NotificationController.markAllAsRead);

// PATCH /api/v1/notification/:id/read — mark one as read
router.patch("/:id/read", auth(), NotificationController.markAsRead);

// DELETE /api/v1/notification/:id — remove one notification
router.delete("/:id", auth(), NotificationController.deleteNotification);

export const NotificationRoutes = router;
