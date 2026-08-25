import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Notification } from "../models/Notification.js";

const PAGE_LIMIT_MAX = 100;

export const listMyNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const summary =
    String(req.query.summary ?? "").toLowerCase() === "1" || String(req.query.summary ?? "") === "true";
  if (summary) {
    const [unreadCount, total] = await Promise.all([
      Notification.countDocuments({ userId: req.user._id, read: false }),
      Notification.countDocuments({ userId: req.user._id }),
    ]);
    res.json({ items: [], total, page: 1, limit: 0, unreadCount });
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_LIMIT_MAX, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId: req.user._id }),
    Notification.countDocuments({ userId: req.user._id, read: false }),
  ]);

  res.json({
    items: items.map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      meta: n.meta,
      createdAt: n.createdAt,
    })),
    total,
    page,
    limit,
    unreadCount,
  });
});

export const markNotificationRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const r = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { read: true } },
    { new: true }
  ).lean();
  if (!r) throw new AppError(404, "Not found");
  res.json({ ok: true });
});

export const markAllNotificationsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

export const clearAllNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await Notification.deleteMany({ userId: req.user._id });
  res.json({ ok: true });
});
