import type { IUser } from "../models/User.js";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  STAFF_PERMISSIONS,
  assertStaffPermission,
  hasStaffPermission,
  isStaffAdmin,
} from "./staffPermissions.js";

/** @deprecated Use STAFF_PERMISSIONS — kept for import compatibility */
export const PRODUCT_PERMISSIONS = {
  VIEW: STAFF_PERMISSIONS.PRODUCTS_VIEW,
  CREATE: STAFF_PERMISSIONS.PRODUCTS_CREATE,
  EDIT: STAFF_PERMISSIONS.PRODUCTS_EDIT,
  DELETE: STAFF_PERMISSIONS.PRODUCTS_DELETE,
  IMPORT: STAFF_PERMISSIONS.PRODUCTS_IMPORT,
  EXPORT: STAFF_PERMISSIONS.PRODUCTS_EXPORT,
  APPROVE: STAFF_PERMISSIONS.PRODUCTS_APPROVE,
} as const;

export type ProductPermission = (typeof PRODUCT_PERMISSIONS)[keyof typeof PRODUCT_PERMISSIONS];

export const ALL_PRODUCT_PERMISSIONS: ProductPermission[] = Object.values(PRODUCT_PERMISSIONS);

export function hasProductStaffRestrictions(user: Pick<IUser, "role" | "permissions">): boolean {
  return isStaffAdmin(user);
}

export function hasProductPermission(
  user: Pick<IUser, "role" | "permissions">,
  permission: ProductPermission
): boolean {
  if (user.role === "vendor" || user.role === "dropshipper") return true;
  return hasStaffPermission(user, permission);
}

export function assertProductPermission(
  user: Pick<IUser, "role" | "permissions">,
  permission: ProductPermission
): void {
  if (user.role === "vendor" || user.role === "dropshipper") return;
  assertStaffPermission(user, permission);
}
