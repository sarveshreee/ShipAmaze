import type { IUser } from "../models/User.js";
import { AppError } from "../middleware/errorMiddleware.js";

/** Granular product permissions for admin staff accounts. */
export const PRODUCT_PERMISSIONS = {
  VIEW: "products.view",
  CREATE: "products.create",
  EDIT: "products.edit",
  DELETE: "products.delete",
  IMPORT: "products.import",
  EXPORT: "products.export",
  APPROVE: "products.approve",
} as const;

export type ProductPermission = (typeof PRODUCT_PERMISSIONS)[keyof typeof PRODUCT_PERMISSIONS];

export const ALL_PRODUCT_PERMISSIONS: ProductPermission[] = Object.values(PRODUCT_PERMISSIONS);

export function hasProductStaffRestrictions(user: Pick<IUser, "role" | "permissions">): boolean {
  if (user.role !== "admin") return false;
  return (user.permissions ?? []).some((p) => p.startsWith("products."));
}

/** Owner admins (no products.* entries) retain full product access. */
export function hasProductPermission(
  user: Pick<IUser, "role" | "permissions">,
  permission: ProductPermission
): boolean {
  if (user.role === "vendor" || user.role === "dropshipper") return true;
  if (user.role !== "admin") return false;
  if (!hasProductStaffRestrictions(user)) return true;
  return (user.permissions ?? []).includes(permission);
}

export function assertProductPermission(
  user: Pick<IUser, "role" | "permissions">,
  permission: ProductPermission
): void {
  if (!hasProductPermission(user, permission)) {
    throw new AppError(403, `Missing permission: ${permission}`);
  }
}
