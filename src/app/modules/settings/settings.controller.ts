import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { SettingsService } from "./settings.service";

const getSettings = catchAsync(async (_req: Request, res: Response) => {
  const result = await SettingsService.getSettings();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Settings retrieved successfully",
    data: result,
  });
});

const getPublicSettings = catchAsync(async (_req: Request, res: Response) => {
  const result = await SettingsService.getPublicSettings();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Settings retrieved successfully",
    data: result,
  });
});

const updateSettings = catchAsync(async (req: Request, res: Response) => {
  const result = await SettingsService.updateSettings(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Settings updated successfully",
    data: result,
  });
});

export const SettingsController = {
  getSettings,
  getPublicSettings,
  updateSettings,
};
