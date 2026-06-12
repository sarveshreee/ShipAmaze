import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./authMiddleware.js";
import { AppError } from "./errorMiddleware.js";
import {
  assertOwnerAdmin,
  hasStaffPermission,
  isOwnerAdmin,
  type StaffPermission,
} from "../utils/staffPermissions.js";

/** Blocks admin staff; owner admin and non-admin roles pass through. */
export function requireOwnerAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError(401, "Unauthorized"));
    return;
  }
  if (req.user.role !== "admin") {
    next();
    return;
  }
  try {
    assertOwnerAdmin(req.user);
    next();
  } catch (e) {
    next(e);
  }
}

export function requireStaffPermission(...permissions: (StaffPermission | string)[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "Unauthorized"));
      return;
    }
    if (req.user.role !== "admin") {
      next();
      return;
    }
    if (isOwnerAdmin(req.user)) {
      next();
      return;
    }
    if (permissions.some((p) => hasStaffPermission(req.user!, p))) {
      next();
      return;
    }
    next(new AppError(403, `Missing permission: ${permissions.join(" or ")}`));
  };
}
