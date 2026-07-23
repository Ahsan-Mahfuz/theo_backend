/* eslint-disable @typescript-eslint/no-explicit-any */
import { SupportTicket } from "./support.model";
import sendEmail from "../../utilities/sendEmail";
import config from "../../config";
import AppError from "../../error/appError";
import { NotificationService } from "../notification/notification.service";

// ─── Submit a support request (Help & Support form) ───────────────────────────
const createTicket = async (
  userId: string | undefined,
  payload: { subject: string; email: string; message: string },
) => {
  const ticket = await SupportTicket.create({
    user: userId,
    subject: payload.subject,
    email: payload.email,
    message: payload.message,
  });

  // notify the support inbox (falls back to the admin email)
  const supportInbox =
    (config.admin_email as string) || (config.smtp.smtp_mail as string);

  await sendEmail({
    email: supportInbox,
    subject: `Help & Support: ${payload.subject}`,
    html: `
      <h2>New support request</h2>
      <p><strong>Subject:</strong> ${payload.subject}</p>
      <p><strong>From:</strong> ${payload.email}</p>
      <p><strong>Message:</strong></p>
      <p>${payload.message}</p>
    `,
  });

  // in-app notification for the admin/super-admin dashboard
  await NotificationService.notifyAdmins({
    title: "New support request",
    message: `${payload.email}: ${payload.subject}`,
    titleFr: "Nouvelle demande d'assistance",
    messageFr: `${payload.email}: ${payload.subject}`,
    type: "support_ticket",
    data: { ticketId: String(ticket._id) },
  });

  return ticket;
};

// ─── Admin: list tickets ──────────────────────────────────────────────────────
const getAllTickets = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (query.status) filter.status = query.status;

  const [data, total] = await Promise.all([
    SupportTicket.find(filter)
      .populate("user", "firstName lastName name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SupportTicket.countDocuments(filter),
  ]);

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Admin: update ticket status ──────────────────────────────────────────────
const updateTicketStatus = async (
  ticketId: string,
  status: "open" | "resolved",
) => {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    { status },
    { new: true },
  );
  if (!ticket) throw new AppError(404, "Support ticket not found");
  return ticket;
};

export const SupportService = {
  createTicket,
  getAllTickets,
  updateTicketStatus,
};
