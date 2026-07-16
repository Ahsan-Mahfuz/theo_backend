/* eslint-disable @typescript-eslint/no-explicit-any */
import { Notification } from "./notification.model";
import { TNotificationType } from "./notification.interface";
import { User } from "../user/user.model";
import sendPushNotification from "../../utilities/sendPushNotification";
import { emitToUser } from "../../socket";

interface ICreateNotification {
  user: string; // recipient userId
  title: string;
  message: string;
  type?: TNotificationType;
  data?: Record<string, unknown>;
}

/**
 * Creates an in-app notification and fans it out over every channel the
 * recipient has available — WITHOUT ever throwing on a delivery failure:
 *
 *   1. Persisted to Mongo (the source of truth for the bell / list).
 *   2. Pushed live over Socket.io to the user's personal room
 *      (`notification:new` + `notification:unreadCount`) — powers the web
 *      dashboard & website in real time (no push permission needed).
 *   3. OneSignal push — ONLY fires if the user has a registered `playerId`.
 *      Web clients (admin, super admin, host-on-web) never register one, so
 *      they never receive a push; only the host/cleaner mobile app does.
 */
const createNotification = async (payload: ICreateNotification) => {
  const notification = await Notification.create({
    user: payload.user,
    title: payload.title,
    message: payload.message,
    type: payload.type || "general",
    data: payload.data || {},
  });

  // ─── 2. real-time in-app (web + app) ────────────────────────────────────────
  try {
    const unreadCount = await Notification.countDocuments({
      user: payload.user,
      isRead: false,
    });
    emitToUser(payload.user, "notification:new", notification);
    emitToUser(payload.user, "notification:unreadCount", { unreadCount });
  } catch {
    // socket delivery must never break the main flow
  }

  // ─── 3. OneSignal push (mobile app only) ────────────────────────────────────
  try {
    const recipient = await User.findById(payload.user).select("playerId");
    if (recipient?.playerId) {
      await sendPushNotification(recipient.playerId, {
        title: payload.title,
        message: payload.message,
        data: { type: payload.type || "general", ...(payload.data || {}) },
      });
    }
  } catch {
    // push failure must never break the main flow
  }

  return notification;
};

/**
 * Broadcast a notification to every active admin / super admin (dashboard).
 * Used for platform-wide events (new signups, support tickets, disputes…).
 * Admins have no `playerId`, so this is in-app + socket only — no push.
 */
const notifyAdmins = async (payload: Omit<ICreateNotification, "user">) => {
  const admins = await User.find({
    role: "admin",
    isBlocked: { $ne: true },
    isDeleted: false,
  }).select("_id");

  await Promise.all(
    admins.map((admin) =>
      createNotification({ ...payload, user: String(admin._id) }),
    ),
  );

  return { notified: admins.length };
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
  if (query.type) filter.type = query.type;

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

const getUnreadCount = async (userId: string) => {
  const unreadCount = await Notification.countDocuments({
    user: userId,
    isRead: false,
  });
  return { unreadCount };
};

const markAsRead = async (userId: string, notificationId: string) => {
  await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { isRead: true },
  );
  const { unreadCount } = await getUnreadCount(userId);
  emitToUser(userId, "notification:unreadCount", { unreadCount });
  return { message: "Notification marked as read", unreadCount };
};

const markAllAsRead = async (userId: string) => {
  await Notification.updateMany(
    { user: userId, isRead: false },
    { isRead: true },
  );
  emitToUser(userId, "notification:unreadCount", { unreadCount: 0 });
  return { message: "All notifications marked as read" };
};

const deleteNotification = async (userId: string, notificationId: string) => {
  await Notification.findOneAndDelete({ _id: notificationId, user: userId });
  const { unreadCount } = await getUnreadCount(userId);
  emitToUser(userId, "notification:unreadCount", { unreadCount });
  return { message: "Notification deleted" };
};

export const NotificationService = {
  createNotification,
  notifyAdmins,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
