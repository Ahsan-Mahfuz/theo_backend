/* eslint-disable @typescript-eslint/no-explicit-any */
import { Notification } from "./notification.model";
import { TNotificationType } from "./notification.interface";
import { User } from "../user/user.model";
import sendPushNotification from "../../utilities/sendPushNotification";

interface ICreateNotification {
  user: string; // recipient userId
  title: string;
  message: string;
  type?: TNotificationType;
  data?: Record<string, unknown>;
}

/**
 * Creates an in-app notification AND fires an OneSignal push (if the user has
 * a registered playerId). Reused across modules — never throws on push failure.
 */
const createNotification = async (payload: ICreateNotification) => {
  const notification = await Notification.create({
    user: payload.user,
    title: payload.title,
    message: payload.message,
    type: payload.type || "general",
    data: payload.data || {},
  });

  // fire-and-forget push
  try {
    const recipient = await User.findById(payload.user).select("playerId");
    if (recipient?.playerId) {
      await sendPushNotification(recipient.playerId, {
        title: payload.title,
        message: payload.message,
        data: payload.data || {},
      });
    }
  } catch {
    // push failure must never break the main flow
  }

  return notification;
};

// ─── Queries ────────────────────────────────────────────────────────────────

const getMyNotifications = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter: any = { user: userId };
  if (query.isRead !== undefined) filter.isRead = query.isRead === "true";

  const [data, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, isRead: false }),
  ]);

  return {
    data,
    unreadCount,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

const markAsRead = async (userId: string, notificationId: string) => {
  await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { isRead: true },
  );
  return { message: "Notification marked as read" };
};

const markAllAsRead = async (userId: string) => {
  await Notification.updateMany(
    { user: userId, isRead: false },
    { isRead: true },
  );
  return { message: "All notifications marked as read" };
};

export const NotificationService = {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};
