/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { SupportService } from "./support.service";

const createTicket = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId; // optional
  const result = await SupportService.createTicket(userId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Your message has been sent. Our team will get back to you soon.",
    data: result,
  });
});

const getAllTickets = catchAsync(async (req: Request, res: Response) => {
  const result = await SupportService.getAllTickets(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Support tickets retrieved successfully",
    data: result,
  });
});

const updateTicketStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await SupportService.updateTicketStatus(
    req.params.id,
    req.body.status,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Support ticket updated successfully",
    data: result,
  });
});

export const SupportController = {
  createTicket,
  getAllTickets,
  updateTicketStatus,
};
