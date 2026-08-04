import type { Request } from "express";
import type { Types } from "mongoose";
import { UserActivityLog, type ActivityModule } from "../models/UserActivityLog.js";
import { parseClientContext } from "./requestContext.js";
import { auditLog } from "../utils/devLog.js";

export type RecordActivityInput = {
  user: { _id: Types.ObjectId | unknown; name: string; role: string };
  module: ActivityModule;
  action: string;
  metadata?: Record<string, unknown>;
  req?: Request;
};

/** Fire-and-forget user activity log (never throws to callers). */
export function recordUserActivity(input: RecordActivityInput): void {
  void (async () => {
    try {
      const ctx = input.req ? parseClientContext(input.req) : null;
      await UserActivityLog.create({
        userId: input.user._id,
        userName: input.user.name,
        role: input.user.role,
        module: input.module,
        action: input.action,
        metadata: input.metadata,
        browser: ctx?.browser ?? "",
        ipAddress: ctx?.ipAddress ?? "",
        userAgent: ctx?.userAgent ?? "",
      });
      auditLog("user_activity", {
        userId: String(input.user._id),
        module: input.module,
        action: input.action,
      });
    } catch (e: unknown) {
      console.warn(
        "[activity] log failed:",
        e instanceof Error ? e.message : e
      );
    }
  })();
}

export const ACTIVITY_ACTIONS = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  PRODUCT_ADDED: "Product Added",
  PRODUCT_UPDATED: "Product Updated",
  PRODUCT_DELETED: "Product Deleted",
  ORDER_CREATED: "Order Created",
  ORDER_UPDATED: "Order Updated",
  ORDER_CANCELLED: "Order Cancelled",
  PICKUP_ADDED: "Pickup Address Added",
  PICKUP_EDITED: "Pickup Address Edited",
  WAREHOUSE_UPDATED: "Warehouse Updated",
  COURIER_CHANGED: "Courier Changed",
  KYC_SUBMITTED: "KYC Submitted",
  KYC_APPROVED: "KYC Approved",
  WALLET_UPDATED: "Wallet Updated",
  SETTINGS_CHANGED: "Settings Changed",
  SUPPORT_TICKET_CREATED: "Support Ticket Created",
  SUPPORT_TICKET_UPDATED: "Support Ticket Updated",
  IMPERSONATION_START: "Impersonation Start",
} as const;
