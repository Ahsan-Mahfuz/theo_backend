/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { AssignmentService } from "./assignment.service";

// ─── Host ─────────────────────────────────────────────────────────────────────

const assignCleaner = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await AssignmentService.assignCleaner(
    hostId,
    req.params.accommodationId,
    req.body,
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Cleaner assigned. Request sent to the cleaner.",
    data: result,
  });
});

const getAccommodationCleaners = catchAsync(
  async (req: Request, res: Response) => {
    const hostId = (req as any).user.userId;
    const result = await AssignmentService.getAccommodationCleaners(
      hostId,
      req.params.accommodationId,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Assigned cleaners retrieved successfully",
      data: result,
    });
  },
);

const changeRole = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await AssignmentService.changeRole(
    hostId,
    req.params.assignmentId,
    req.body.role,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Cleaner role updated successfully",
    data: result,
  });
});

const removeAssignment = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await AssignmentService.removeAssignment(
    hostId,
    req.params.assignmentId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const findHousekeepers = catchAsync(async (req: Request, res: Response) => {
  const result = await AssignmentService.findHousekeepers(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Housekeepers retrieved successfully",
    data: result,
  });
});

const getCleanerProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await AssignmentService.getCleanerProfile(req.params.cleanerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Cleaner profile retrieved successfully",
    data: result,
  });
});

const getCleanerAssignments = catchAsync(async (req: Request, res: Response) => {
  const hostId = (req as any).user.userId;
  const result = await AssignmentService.getCleanerAssignmentsForHost(
    hostId,
    req.params.cleanerId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Cleaner assignments retrieved successfully",
    data: result,
  });
});

// ─── Cleaner ──────────────────────────────────────────────────────────────────

const respondToAssignment = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await AssignmentService.respondToAssignment(
    cleanerId,
    req.params.assignmentId,
    req.body.action,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Request ${req.body.action === "accept" ? "accepted" : "refused"} successfully`,
    data: result,
  });
});

const getMyRequests = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await AssignmentService.getMyRequests(
    cleanerId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Requests retrieved successfully",
    data: result,
  });
});

const getMyAccommodations = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = (req as any).user.userId;
  const result = await AssignmentService.getMyAccommodations(
    cleanerId,
    req.query as any,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Accommodations retrieved successfully",
    data: result,
  });
});

export const AssignmentController = {
  assignCleaner,
  getAccommodationCleaners,
  changeRole,
  removeAssignment,
  findHousekeepers,
  getCleanerProfile,
  getCleanerAssignments,
  respondToAssignment,
  getMyRequests,
  getMyAccommodations,
};
