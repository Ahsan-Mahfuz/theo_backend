/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { CalendarService } from "./calendar.service";

const addConnection = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await CalendarService.addConnection(
    hostId,
    req.params.accommodationId,
    req.body,
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Calendar connected successfully",
    data: result,
  });
});

const listConnections = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await CalendarService.listConnections(
    hostId,
    req.params.accommodationId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Calendar connections retrieved successfully",
    data: result,
  });
});

const removeConnection = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await CalendarService.removeConnection(
    hostId,
    req.params.connectionId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const syncAccommodation = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await CalendarService.syncAccommodation(
    hostId,
    req.params.accommodationId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const getMonthCalendar = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await CalendarService.getMonthCalendar(
    hostId,
    req.params.accommodationId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Calendar retrieved successfully",
    data: result,
  });
});

const getList = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await CalendarService.getList(
    hostId,
    req.params.accommodationId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Calendar list retrieved successfully",
    data: result,
  });
});

export const CalendarController = {
  addConnection,
  listConnections,
  removeConnection,
  syncAccommodation,
  getMonthCalendar,
  getList,
};
