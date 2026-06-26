import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { ContentService } from "./content.service";

const getContent = catchAsync(async (req: Request, res: Response) => {
  const result = await ContentService.getContent(req.params.type);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Content retrieved successfully",
    data: result,
  });
});

const getAllContent = catchAsync(async (_req: Request, res: Response) => {
  const result = await ContentService.getAllContent();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Content retrieved successfully",
    data: result,
  });
});

const upsertContent = catchAsync(async (req: Request, res: Response) => {
  const result = await ContentService.upsertContent(
    req.params.type,
    req.body.content,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Content updated successfully",
    data: result,
  });
});

export const ContentController = {
  getContent,
  getAllContent,
  upsertContent,
};
