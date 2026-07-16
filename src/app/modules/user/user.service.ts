/* eslint-disable @typescript-eslint/no-explicit-any */
import AppError from "../../error/appError";
import { User } from "./user.model";

const getAllUsers = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;
  const role = (query.role as string) || "host"; // default: hosts

  // Admin-only listing, so it must show everyone — including cleaners who hid
  // their profile from hosts (isActive: false). Only deleted users drop out.
  const filter: any = { role, isDeleted: { $ne: true } };

  // ─── Search: name, email, phone ───────────────────────────────────────────
  if (query.search) {
    const regex = new RegExp(String(query.search), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const [data, total] = await Promise.all([
    User.find(filter)
      .select(
        "-password -otp -otpExpiry -passwordResetToken -passwordResetExpiry",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Push device token (OneSignal playerId) ───────────────────────────────────
// Called by the host/cleaner MOBILE APP once the user grants push permission.
// Web clients (admin/super admin dashboard, host website) never call this, so
// they naturally never receive OneSignal pushes — only in-app + socket.
const registerDeviceToken = async (userId: string, playerId: string) => {
  if (!playerId) throw new AppError(400, "playerId is required");
  await User.findByIdAndUpdate(userId, { playerId });
  return { message: "Device registered for push notifications" };
};

const removeDeviceToken = async (userId: string) => {
  await User.findByIdAndUpdate(userId, { $unset: { playerId: "" } });
  return { message: "Device unregistered from push notifications" };
};

export const UserService = {
  getAllUsers,
  registerDeviceToken,
  removeDeviceToken,
};
