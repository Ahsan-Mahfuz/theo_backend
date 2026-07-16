import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import AppError from "../error/appError";
import { User } from "../modules/user/user.model";
import { TRole } from "../modules/user/user.interface";
import { ITokenPayload } from "../modules/auth/auth.interface";
import config from "../config";

export const auth = (...roles: TRole[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next(new AppError(401, "Unauthorized – no token provided"));
      }

      const token = authHeader.split(" ")[1];

      let decoded: ITokenPayload;
      try {
        decoded = jwt.verify(
          token,
          config.jwt_access_secret as string,
        ) as ITokenPayload;
      } catch {
        return next(
          new AppError(401, "Unauthorized – invalid or expired token"),
        );
      }

      const user = await User.findById(decoded.userId).select("isBlocked isDeleted role");
      if (!user)
        return next(new AppError(401, "Unauthorized – user no longer exists"));
      if (user.isDeleted)
        return next(new AppError(403, "Your account has been deleted"));
      // Only an admin block locks a user out. `isActive` is the user's own
      // profile-visibility switch — a cleaner who hides their profile must still
      // be able to use the app (and to turn it back on, which needs this route).
      if (user.isBlocked)
        return next(new AppError(403, "Your account has been blocked"));

      if (roles.length > 0 && (!decoded.role || !roles.includes(decoded.role))) {
        return next(
          new AppError(
            403,
            `Forbidden – this route is restricted to: ${roles.join(", ")}`,
          ),
        );
      }

      req.user = decoded;
      next();
    } catch (err) {
      next(err);
    }
  };
};

// ─── Convenience aliases ──────────────────────────────────────────────────────
export const adminAuth = auth("admin");
export const hostAuth = auth("host");
export const cleanerAuth = auth("cleaner");
