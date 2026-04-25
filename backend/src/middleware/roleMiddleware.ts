import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./authMiddleware.js";
import type { UserRole } from "../models/User.js";
import { AppError } from "./errorMiddleware.js";

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "Unauthorized"));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Forbidden"));
    }
    next();
  };
}
