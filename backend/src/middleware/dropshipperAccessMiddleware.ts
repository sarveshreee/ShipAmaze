import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./authMiddleware.js";
import { AppError } from "./errorMiddleware.js";
import { Dropshipper, type DropshipperAccessType } from "../models/Dropshipper.js";

export type { DropshipperAccessType };

export type DropshipperAccessState = {
  accessType: DropshipperAccessType;
  allowWarehouseAccess: boolean;
  allowOwnPickupProcessing: boolean;
};

export async function getDropshipperAccessState(userId: unknown): Promise<DropshipperAccessState> {
  const d = await Dropshipper.findOne({ userId })
    .select("accessType allowWarehouseAccess allowOwnPickupProcessing")
    .lean();
  const accessType = d?.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL";
  const allowWarehouseAccess =
    typeof d?.allowWarehouseAccess === "boolean" ? d.allowWarehouseAccess : true;
  const allowOwnPickupProcessing = d?.allowOwnPickupProcessing === true;
  return { accessType, allowWarehouseAccess, allowOwnPickupProcessing };
}

export async function getDropshipperAccessType(userId: unknown): Promise<DropshipperAccessType> {
  const state = await getDropshipperAccessState(userId);
  return state.accessType;
}

export async function getDropshipperWarehouseAccess(userId: unknown): Promise<boolean> {
  const state = await getDropshipperAccessState(userId);
  return state.allowWarehouseAccess;
}

export async function getDropshipperOwnPickupProcessing(userId: unknown): Promise<boolean> {
  const state = await getDropshipperAccessState(userId);
  return state.allowOwnPickupProcessing;
}

/** Blocks restricted dropshippers from operational APIs (warehouses, vendors, order processing). */
export const requireFullDropshipper = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) return next(new AppError(401, "Unauthorized"));
  if (req.user.role !== "dropshipper") return next();
  const { accessType } = await getDropshipperAccessState(req.user._id);
  if (accessType === "RESTRICTED") {
    return next(new AppError(403, "Your account has restricted access. Contact admin for full access."));
  }
  return next();
};

/** Blocks dropshippers from warehouse/vendor APIs when ALLOW_WAREHOUSE_ACCESS is OFF. */
export const requireDropshipperWarehouseAccess = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) return next(new AppError(401, "Unauthorized"));
  if (req.user.role !== "dropshipper") return next();
  const allowed = await getDropshipperWarehouseAccess(req.user._id);
  if (!allowed) {
    return next(new AppError(403, "Warehouse and vendor access is disabled for this dropshipper."));
  }
  return next();
};

/**
 * Blocks dropshippers from self-processing shipments unless admin enabled
 * own-pickup processing. Works even when accessType is RESTRICTED — the admin
 * toggle is the gate. Admins and other roles pass through.
 */
export const requireDropshipperOwnPickupProcessing = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) return next(new AppError(401, "Unauthorized"));
  if (req.user.role !== "dropshipper") return next();
  const { allowOwnPickupProcessing } = await getDropshipperAccessState(req.user._id);
  if (!allowOwnPickupProcessing) {
    return next(
      new AppError(403, "Own pickup processing is disabled for this dropshipper. Contact admin to enable it.")
    );
  }
  return next();
};
