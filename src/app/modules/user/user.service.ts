/* eslint-disable @typescript-eslint/no-explicit-any */
import { User } from "./user.model";

const getAllUsers = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;
  const role = (query.role as string) || "host"; // default: hosts

  const filter: any = { role, isActive: true };

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

export const UserService = { getAllUsers };
