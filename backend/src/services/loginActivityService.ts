import crypto from "node:crypto";
import type { Request } from "express";
import type { Types } from "mongoose";
import { LoginSession } from "../models/LoginSession.js";
import { parseClientContext } from "./requestContext.js";

export function createSessionToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function startLoginSession(
  user: { _id: Types.ObjectId | unknown; name: string; email: string; role: string },
  req: Request
): Promise<string> {
  const ctx = parseClientContext(req);
  const sessionToken = createSessionToken();
  const now = new Date();

  await LoginSession.create({
    userId: user._id,
    userName: user.name,
    email: user.email,
    role: user.role,
    sessionToken,
    loginTime: now,
    lastActiveTime: now,
    browser: ctx.browser,
    operatingSystem: ctx.operatingSystem,
    deviceType: ctx.deviceType,
    ipAddress: ctx.ipAddress,
    location: ctx.location ?? "",
    userAgent: ctx.userAgent,
    isActive: true,
  });

  return sessionToken;
}

export async function endLoginSession(sessionToken: string | undefined): Promise<void> {
  const token = String(sessionToken ?? "").trim();
  if (!token) return;

  const session = await LoginSession.findOne({ sessionToken: token, isActive: true });
  if (!session) return;

  const logoutTime = new Date();
  session.logoutTime = logoutTime;
  session.isActive = false;
  session.lastActiveTime = logoutTime;
  await session.save();
}

const lastActiveThrottleMs = 60_000;
const lastActiveCache = new Map<string, number>();

export async function touchLoginSessionActivity(sessionToken: string | undefined): Promise<void> {
  const token = String(sessionToken ?? "").trim();
  if (!token) return;

  const now = Date.now();
  const prev = lastActiveCache.get(token) ?? 0;
  if (now - prev < lastActiveThrottleMs) return;
  lastActiveCache.set(token, now);

  await LoginSession.updateOne(
    { sessionToken: token, isActive: true },
    { $set: { lastActiveTime: new Date() } }
  ).catch(() => undefined);
}

export function sessionDurationMs(
  loginTime: Date,
  logoutTime?: Date | null,
  lastActiveTime?: Date | null
): number {
  const end = logoutTime ?? lastActiveTime ?? new Date();
  return Math.max(0, end.getTime() - loginTime.getTime());
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
