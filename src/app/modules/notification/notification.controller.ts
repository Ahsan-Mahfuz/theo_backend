/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { NotificationService } from "./notification.service";

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await NotificationService.getMyNotifications(
    userId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Notifications retrieved successfully",
    data: result,
  });
});

const getFrenchNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await NotificationService.getFrenchNotifications(
    userId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "French notifications retrieved successfully",
    data: result,
  });
});

const createNotification = catchAsync(async (req: Request, res: Response) => {
  const currentUserId = (req as any).user.userId;
  const payload = {
    ...req.body,
    user: req.body.user || currentUserId,
  };
  const result = await NotificationService.createNotification(payload);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Notification created successfully",
    data: result,
  });
});

const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await NotificationService.getUnreadCount(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Unread count retrieved successfully",
    data: result,
  });
});

const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await NotificationService.markAsRead(userId, req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await NotificationService.markAllAsRead(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await NotificationService.deleteNotification(
    userId,
    req.params.id,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const NotificationController = {
  getMyNotifications,
  getFrenchNotifications,
  createNotification,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
