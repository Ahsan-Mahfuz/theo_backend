/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { ScheduleService } from "./schedule.service";

const toPaths = (req: Request): string[] => {
  if (req.files && Array.isArray(req.files)) {
    return (req.files as Express.Multer.File[]).map(
      (file) => `/uploads/profiles/${file.filename}`,
    );
  }
  return [];
};

// ─── Host ─────────────────────────────────────────────────────────────────────

const createSchedule = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await ScheduleService.createSchedule(
    hostId,
    req.params.accommodationId,
    req.body,
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Cleaning scheduled successfully",
    data: result,
  });
});

const updateSchedule = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await ScheduleService.updateSchedule(
    hostId,
    req.params.id,
    req.body,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedule updated successfully",
    data: result,
  });
});

const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await ScheduleService.deleteSchedule(hostId, req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedule deleted successfully",
    data: result,
  });
});

const getHostSchedules = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await ScheduleService.getHostSchedules(hostId, req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedules retrieved successfully",
    data: result,
  });
});

const completeTask = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await ScheduleService.completeTask(hostId, req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Task marked as completed",
    data: result,
  });
});

const invalidateProof = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await ScheduleService.invalidateProof(hostId, req.params.id, {
    reason: req.body.reason,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Cleaning invalidated and sent back to the cleaner",
    data: result,
  });
});

// ─── Cleaner ──────────────────────────────────────────────────────────────────

const respondToSchedule = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await ScheduleService.respondToSchedule(
    cleanerId,
    req.params.id,
    req.body.action,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Schedule ${req.body.action === "accept" ? "accepted" : "refused"} successfully`,
    data: result,
  });
});

const getCleanerSchedules = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await ScheduleService.getCleanerSchedules(
    cleanerId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedules retrieved successfully",
    data: result,
  });
});

const getCleanerHome = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await ScheduleService.getCleanerHome(cleanerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Home retrieved successfully",
    data: result,
  });
});

const getCleanerPlanning = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await ScheduleService.getCleanerPlanning(
    cleanerId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Planning retrieved successfully",
    data: result,
  });
});

const submitProof = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await ScheduleService.submitProof(cleanerId, req.params.id, {
    proofNotes: req.body.proofNotes,
    proofPhotos: toPaths(req),
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Proof submitted successfully",
    data: result,
  });
});

const reportDispute = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await ScheduleService.reportDispute(cleanerId, req.params.id, {
    reason: req.body.reason,
    notes: req.body.notes,
    photos: toPaths(req),
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Dispute reported successfully",
    data: result,
  });
});

// ─── Shared ───────────────────────────────────────────────────────────────────

const getScheduleById = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await ScheduleService.getScheduleById(userId, req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedule retrieved successfully",
    data: result,
  });
});

export const ScheduleController = {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getHostSchedules,
  completeTask,
  invalidateProof,
  respondToSchedule,
  getCleanerSchedules,
  getCleanerHome,
  getCleanerPlanning,
  submitProof,
  reportDispute,
  getScheduleById,
};
