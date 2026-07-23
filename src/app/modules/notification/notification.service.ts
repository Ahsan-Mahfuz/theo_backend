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
  titleFr?: string;
  messageFr?: string;
  title_fr?: string;
  message_fr?: string;
  titleFn?: string;
  messageFn?: string;
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
  const titleFr = payload.titleFr || payload.title_fr || payload.titleFn;
  const messageFr = payload.messageFr || payload.message_fr || payload.messageFn;

  const notification = await Notification.create({
    user: payload.user,
    title: payload.title,
    message: payload.message,
    ...(titleFr ? { titleFr } : {}),
    ...(messageFr ? { messageFr } : {}),
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

const translateToFrenchFallback = (title: string, message: string) => {
  let titleFr = title;
  let messageFr = message;

  // Title translations
  if (title === "New cleaning request") titleFr = "Nouvelle demande de nettoyage";
  else if (title.startsWith("Cleaning request")) {
    if (title.includes("accepted")) titleFr = "Demande de nettoyage acceptée";
    else if (title.includes("refused")) titleFr = "Demande de nettoyage refusée";
    else titleFr = "Demande de nettoyage";
  }
  else if (title === "New cleaning scheduled") titleFr = "Nouveau nettoyage planifié";
  else if (title === "Cleaning schedule reassigned") titleFr = "Planning de ménage réattribué";
  else if (title === "Cleaning schedule updated") titleFr = "Planning de ménage mis à jour";
  else if (title === "Cleaning schedule cancelled") titleFr = "Planning de ménage annulé";
  else if (title === "Cleaning accepted") titleFr = "Nettoyage accepté";
  else if (title === "Cleaning refused") titleFr = "Nettoyage refusé";
  else if (title === "Proof submitted") titleFr = "Preuve soumise";
  else if (title === "Dispute reported") titleFr = "Litige signalé";
  else if (title === "Dispute needs review") titleFr = "Litige à examiner";
  else if (title === "Task completed") titleFr = "Tâche terminée";
  else if (title === "Cleaning not validated") titleFr = "Nettoyage non validé";
  else if (title === "Payment outside app requested") titleFr = "Paiement hors application demandé";
  else if (title === "Payment outside app approved") titleFr = "Paiement hors application approuvé";
  else if (title === "Payment received") titleFr = "Paiement reçu";
  else if (title === "New payment received") titleFr = "Nouveau paiement reçu";
  else if (title === "Payouts enabled") titleFr = "Paiements activés";
  else if (title === "You've been paid") titleFr = "Vous avez été payé";
  else if (title === "Payout released") titleFr = "Paiement libéré";
  else if (title === "Payment refunded") titleFr = "Paiement remboursé";
  else if (title.startsWith("New message from")) titleFr = title.replace("New message from", "Nouveau message de");
  else if (title === "Welcome to Gestlio Admin") titleFr = "Bienvenue sur Gestlio Admin";
  else if (title === "New support request") titleFr = "Nouvelle demande d'assistance";
  else if (title === "New user joined") titleFr = "Nouvel utilisateur inscrit";

  // Message translations (pattern replacement)
  if (message.startsWith("A host wants to add you for ")) {
    const acc = message.replace("A host wants to add you for ", "").replace(/\.$/, "");
    messageFr = `Un hôte souhaite vous ajouter pour ${acc}.`;
  } else if (message.includes("has accepted your request for ")) {
    const acc = message.split("has accepted your request for ")[1]?.replace(/\.$/, "") || "";
    messageFr = `Un agent d'entretien a accepté votre demande pour ${acc}.`;
  } else if (message.includes("has refused your request for ")) {
    const acc = message.split("has refused your request for ")[1]?.replace(/\.$/, "") || "";
    messageFr = `Un agent d'entretien a refusé votre demande pour ${acc}.`;
  } else if (message.startsWith("The cleaner accepted the cleaning for ")) {
    const acc = message.replace("The cleaner accepted the cleaning for ", "").replace(". You can now proceed to payment.", "");
    messageFr = `L'agent d'entretien a accepté le nettoyage pour ${acc}. Vous pouvez maintenant procéder au paiement.`;
  } else if (message.startsWith("The cleaner refused the cleaning for ")) {
    const acc = message.replace("The cleaner refused the cleaning for ", "").replace(/\.$/, "");
    messageFr = `L'agent d'entretien a refusé le nettoyage pour ${acc}.`;
  } else if (message.startsWith("The cleaner submitted proof of completion for ")) {
    const acc = message.replace("The cleaner submitted proof of completion for ", "").replace(/\.$/, "");
    messageFr = `L'agent d'entretien a soumis la preuve de réalisation pour ${acc}.`;
  } else if (message.startsWith("The host marked the cleaning for ") && message.endsWith(" as completed.")) {
    const acc = message.replace("The host marked the cleaning for ", "").replace(" as completed.", "");
    messageFr = `L'hôte a marqué le nettoyage pour ${acc} comme terminé.`;
  } else if (message.startsWith("The host cancelled the cleaning for ")) {
    const acc = message.replace("The host cancelled the cleaning for ", "").replace(/\.$/, "");
    messageFr = `L'hôte a annulé le ménage pour ${acc}.`;
  } else if (message.startsWith("The cleaner reported a dispute for ")) {
    const acc = message.replace("The cleaner reported a dispute for ", "").replace(/\.$/, "");
    messageFr = `L'agent d'entretien a signalé un litige pour ${acc}.`;
  } else if (message.startsWith("The host reassigned the cleaning for ")) {
    const acc = message.replace("The host reassigned the cleaning for ", "").replace(" to another cleaner.", "");
    messageFr = `L'hôte a réattribué le ménage pour ${acc} à un autre agent d'entretien.`;
  } else if (message.startsWith("The host updated the cleaning for ")) {
    const rest = message.replace("The host updated the cleaning for ", "");
    messageFr = `L'hôte a mis à jour le ménage pour ${rest}`;
  } else if (message.includes("is scheduled for ")) {
    const parts = message.split(" is scheduled for ");
    messageFr = `${parts[0]} est planifié pour le ${parts[1]}`;
  } else if (message === "The host's payment is secured. You can start the cleaning — you'll be paid on approval.") {
    messageFr = "Le paiement de l'hôte est sécurisé. Vous pouvez commencer le nettoyage — vous serez payé après validation.";
  } else if (message === "Your payout account is ready. You can now receive payments.") {
    messageFr = "Votre compte de paiement est prêt. Vous pouvez maintenant recevoir des paiements.";
  } else if (message === "Your payment has been refunded.") {
    messageFr = "Votre paiement a été remboursé.";
  }

  return { titleFr, messageFr };
};

const getFrenchNotifications = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter: any = { user: userId };
  if (query.isRead !== undefined) filter.isRead = query.isRead === "true";
  if (query.type) filter.type = query.type;

  const [rawDocs, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, isRead: false }),
  ]);

  const data = rawDocs.map((doc) => {
    const item = doc.toObject();
    const fallback = translateToFrenchFallback(item.title, item.message);
    const titleFr = item.titleFr || fallback.titleFr;
    const messageFr = item.messageFr || fallback.messageFr;
    return {
      ...item,
      titleEn: item.title,
      messageEn: item.message,
      titleFr,
      messageFr,
      title: titleFr,
      message: messageFr,
    };
  });

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
  getFrenchNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
