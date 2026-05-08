import type { Types } from "mongoose";
import { Notification, type NotificationType } from "../models/Notification.js";
import { User } from "../models/User.js";

export async function createInAppNotification(
  userId: Types.ObjectId,
  type: NotificationType,
  title: string,
  body: string,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await Notification.create({
      userId,
      type,
      title: title.slice(0, 240),
      body: (body || "").slice(0, 4000),
      read: false,
      meta: meta && typeof meta === "object" ? meta : {},
    });
  } catch {
    /* avoid noisy logs in production */
  }
}

/** Notify every active admin user (e.g. new support ticket). */
export async function notifyAllAdmins(
  type: NotificationType,
  title: string,
  body: string,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    const admins = await User.find({ role: "admin", status: "active" }).select("_id").lean();
    await Promise.all(
      admins.map((a) => createInAppNotification(a._id as Types.ObjectId, type, title, body, meta))
    );
  } catch {
    /* ignore */
  }
}
