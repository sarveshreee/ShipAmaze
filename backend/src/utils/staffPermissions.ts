import type { IUser } from "../models/User.js";
import { AppError } from "../middleware/errorMiddleware.js";

/** Operational permissions assignable to admin staff. Finance/config are owner-only. */
export const STAFF_PERMISSIONS = {
  ORDERS_VIEW: "orders.view",
  ORDERS_CREATE: "orders.create",
  ORDERS_EDIT: "orders.edit",
  PICKUPS_VIEW: "pickup-addresses.view",
  PICKUPS_MANAGE: "pickup-addresses.manage",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_CREATE: "products.create",
  PRODUCTS_EDIT: "products.edit",
  PRODUCTS_DELETE: "products.delete",
  PRODUCTS_IMPORT: "products.import",
  PRODUCTS_EXPORT: "products.export",
  PRODUCTS_APPROVE: "products.approve",
  RETURNS_VIEW: "returns.view",
  RETURNS_MANAGE: "returns.manage",
  NDR_VIEW: "ndr.view",
  NDR_MANAGE: "ndr.manage",
  ANALYTICS_VIEW: "analytics.view",
  CHANNELS_VIEW: "channels.view",
  CHANNELS_MANAGE: "channels.manage",
  CUSTOMERS_VIEW: "customers.view",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",
} as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[keyof typeof STAFF_PERMISSIONS];

export const ALL_STAFF_PERMISSIONS: StaffPermission[] = Object.values(STAFF_PERMISSIONS);

type PermUser = Pick<IUser, "role" | "permissions"> & { email?: string | null };

function ownerAdminEmails(): Set<string> {
  return new Set(
    [
      process.env.SINGLE_LOGIN_EMAIL,
      process.env.OWNER_ADMIN_EMAIL,
      ...(process.env.OWNER_ADMIN_EMAILS ?? "").split(","),
      "owner@shipamaze.com",
      "admin@admin.com",
    ]
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => !!email)
  );
}

/** Owner admin: configured platform owner or empty permissions array = full platform access. */
export function isOwnerAdmin(user: PermUser): boolean {
  if (user.role !== "admin") return false;
  const email = user.email?.trim().toLowerCase();
  return (user.permissions ?? []).length === 0 || (!!email && ownerAdminEmails().has(email));
}

export function isStaffAdmin(user: PermUser): boolean {
  return user.role === "admin" && !isOwnerAdmin(user);
}

export function hasStaffPermission(user: PermUser, permission: StaffPermission | string): boolean {
  if (user.role !== "admin") return false;
  if (isOwnerAdmin(user)) return true;
  return (user.permissions ?? []).includes(permission);
}

export function assertStaffPermission(user: PermUser, permission: StaffPermission | string): void {
  if (!hasStaffPermission(user, permission)) {
    throw new AppError(403, `Missing permission: ${permission}`);
  }
}

export function assertOwnerAdmin(user: PermUser): void {
  if (!isOwnerAdmin(user)) {
    throw new AppError(403, "Owner admin access required");
  }
}

/** When admin staff, assert one of the permissions; owner always passes. */
export function assertAdminStaffOneOf(user: PermUser, permissions: (StaffPermission | string)[]): void {
  if (user.role !== "admin") return;
  if (isOwnerAdmin(user)) return;
  if (permissions.some((p) => hasStaffPermission(user, p))) return;
  throw new AppError(403, `Missing permission: ${permissions.join(" or ")}`);
}
