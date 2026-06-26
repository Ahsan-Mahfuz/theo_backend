/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { AccommodationService } from "./accommodation.service";

// ─── Create ───────────────────────────────────────────────────────────────────

const createAccommodation = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;

  const payload: any = { ...req.body };

  // Handle multiple photo uploads (formdata)
  if (req.files && Array.isArray(req.files)) {
    payload.photos = (req.files as Express.Multer.File[]).map(
      (file) => `/uploads/accommodations/${file.filename}`,
    );
  }

  const result = await AccommodationService.createAccommodation(hostId, payload);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Accommodation created successfully",
    data: result,
  });
});

// ─── Get My Accommodations (filter + pagination) ─────────────────────────────

const getMyAccommodations = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await AccommodationService.getMyAccommodations(
    hostId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Accommodations retrieved successfully",
    data: result,
  });
});

// ─── Get Single Accommodation ─────────────────────────────────────────────────

const getAccommodationById = catchAsync(
  async (req: Request, res: Response) => {
    const hostId = (req as any).user.userId;
    const result = await AccommodationService.getAccommodationById(
      hostId,
      req.params.id,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Accommodation retrieved successfully",
      data: result,
    });
  },
);

// ─── Update Accommodation ─────────────────────────────────────────────────────

const updateAccommodation = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;

  const payload: any = { ...req.body };

  // Handle multiple photo uploads on update
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    payload.photos = (req.files as Express.Multer.File[]).map(
      (file) => `/uploads/accommodations/${file.filename}`,
    );
  }

  const result = await AccommodationService.updateAccommodation(
    hostId,
    req.params.id,
    payload,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Accommodation updated successfully",
    data: result,
  });
});

// ─── Delete Accommodation ─────────────────────────────────────────────────────

const deleteAccommodation = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await AccommodationService.deleteAccommodation(
    hostId,
    req.params.id,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const AccommodationController = {
  createAccommodation,
  getMyAccommodations,
  getAccommodationById,
  updateAccommodation,
  deleteAccommodation,
};
