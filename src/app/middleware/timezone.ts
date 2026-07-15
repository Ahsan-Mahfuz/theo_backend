import { NextFunction, Request, Response } from "express";
import { requestContext, TimezoneUtils } from "../utilities/timezone.utils";

// Reads the viewer's IANA timezone from the `x-timezone` header (sent by the
// web apps / mobile app), validates it, and stores it in request-scoped context
// so date helpers render day grouping/labels/ranges in the viewer's local time.
// Falls back to UTC when the header is missing or invalid.
export const timezoneContext = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const raw = req.header("x-timezone");
  const timezone =
    raw && TimezoneUtils.isValidTimezone(raw) ? raw : "UTC";
  requestContext.run({ timezone }, next);
};
