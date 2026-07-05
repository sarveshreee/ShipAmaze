import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { UserActivityLog } from "../models/UserActivityLog.js";

function parsePagination(req: { query: Record<string, unknown> }) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function parseDateRange(req: { query: Record<string, unknown> }): { from: Date; to: Date } {
  const preset = String(req.query.preset ?? "").trim();
  const now = new Date();
  let from: Date;
  let to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (preset === "24h") {
    from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (preset === "7d") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (preset === "30d") {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    const fromRaw = String(req.query.from ?? req.query.dateFrom ?? "").trim();
    const toRaw = String(req.query.to ?? req.query.dateTo ?? "").trim();
    if (fromRaw) {
      from = new Date(fromRaw);
      if (Number.isNaN(from.getTime())) throw new AppError(400, "Invalid from date");
    } else {
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    if (toRaw) {
      to = new Date(toRaw);
      if (Number.isNaN(to.getTime())) throw new AppError(400, "Invalid to date");
      to.setHours(23, 59, 59, 999);
    }
  }

  return { from, to };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const adminListUserActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const { page, limit, skip } = parsePagination(req);
  const { from, to } = parseDateRange(req);
  const userQ = String(req.query.user ?? "").trim();
  const moduleQ = String(req.query.module ?? "").trim();

  const q: Record<string, unknown> = {
    createdAt: { $gte: from, $lte: to },
  };

  if (moduleQ) q.module = moduleQ;
  if (userQ) {
    const or: Record<string, unknown>[] = [
      { userName: new RegExp(escapeRegex(userQ), "i") },
    ];
    if (/^[a-f0-9]{24}$/i.test(userQ)) or.push({ userId: userQ });
    q.$or = or;
  }

  const [rows, total] = await Promise.all([
    UserActivityLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    UserActivityLog.countDocuments(q),
  ]);

  res.json({
    items: rows.map((r) => ({
      id: String(r._id),
      userId: String(r.userId),
      userName: r.userName,
      role: r.role,
      module: r.module,
      action: r.action,
      metadata: r.metadata ?? null,
      browser: r.browser,
      ipAddress: r.ipAddress,
      timestamp: r.createdAt,
    })),
    total,
    page,
    limit,
    range: { from, to },
  });
});

export const adminListActivityModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const modules = await UserActivityLog.distinct("module");
  res.json({ modules: modules.sort() });
});
