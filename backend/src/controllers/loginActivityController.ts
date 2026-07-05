import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { LoginSession } from "../models/LoginSession.js";
import { formatDuration, sessionDurationMs } from "../services/loginActivityService.js";

function parsePagination(req: { query: Record<string, unknown> }) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function parseDateRange(req: { query: Record<string, unknown> }): { from?: Date; to?: Date } {
  const fromRaw = String(req.query.from ?? req.query.dateFrom ?? "").trim();
  const toRaw = String(req.query.to ?? req.query.dateTo ?? "").trim();
  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;
  if (from && Number.isNaN(from.getTime())) throw new AppError(400, "Invalid from date");
  if (to && Number.isNaN(to.getTime())) throw new AppError(400, "Invalid to date");
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const adminListLoginActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const { page, limit, skip } = parsePagination(req);
  const { from, to } = parseDateRange(req);
  const userQ = String(req.query.user ?? "").trim();
  const emailQ = String(req.query.email ?? "").trim();
  const roleQ = String(req.query.role ?? "").trim();
  const sortBy = String(req.query.sortBy ?? "loginTime").trim();
  const sortDir = String(req.query.sortDir ?? "desc").toLowerCase() === "asc" ? 1 : -1;

  const q: Record<string, unknown> = {};
  if (from || to) {
    q.loginTime = {};
    if (from) (q.loginTime as Record<string, Date>).$gte = from;
    if (to) (q.loginTime as Record<string, Date>).$lte = to;
  }
  if (emailQ) q.email = new RegExp(escapeRegex(emailQ), "i");
  if (roleQ && ["admin", "vendor", "dropshipper"].includes(roleQ)) q.role = roleQ;
  if (userQ) {
    q.$or = [
      { userName: new RegExp(escapeRegex(userQ), "i") },
      { email: new RegExp(escapeRegex(userQ), "i") },
    ];
  }

  const sortField =
    sortBy === "email" || sortBy === "role" || sortBy === "lastActiveTime" || sortBy === "browser"
      ? sortBy
      : "loginTime";

  const [rows, total] = await Promise.all([
    LoginSession.find(q).sort({ [sortField]: sortDir }).skip(skip).limit(limit).lean(),
    LoginSession.countDocuments(q),
  ]);

  res.json({
    items: rows.map((s) => {
      const durationMs = sessionDurationMs(s.loginTime, s.logoutTime, s.lastActiveTime);
      return {
        id: String(s._id),
        userName: s.userName,
        email: s.email,
        role: s.role,
        loginTime: s.loginTime,
        logoutTime: s.logoutTime ?? null,
        lastActiveTime: s.lastActiveTime,
        sessionDurationMs: durationMs,
        sessionDuration: formatDuration(durationMs),
        browser: s.browser,
        operatingSystem: s.operatingSystem,
        deviceType: s.deviceType,
        ipAddress: s.ipAddress,
        location: s.location || null,
        isActive: s.isActive,
      };
    }),
    total,
    page,
    limit,
  });
});
