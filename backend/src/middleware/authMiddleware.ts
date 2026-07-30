import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { User, type IUser } from "../models/User.js";
import { AppError } from "./errorMiddleware.js";
import { touchLoginSessionActivity } from "../services/loginActivityService.js";
import { authUserCache } from "../utils/ttlCache.js";

export interface AuthRequest extends Request {
  user?: IUser;
  sessionId?: string;
}

export async function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token || !token.trim()) throw new AppError(401, "Missing or invalid authorization token");

    const payload = verifyToken(token);
    const cacheKey = `user:${payload.sub}`;
    let user = authUserCache.get(cacheKey) as IUser | undefined;
    if (!user) {
      const found = await User.findById(payload.sub);
      if (!found) throw new AppError(401, "Unauthorized");
      user = found;
      authUserCache.set(cacheKey, found);
    }

    if (user.status === "blocked") throw new AppError(403, "Your account has been blocked");
    if (user.status === "inactive") throw new AppError(403, "Your account is inactive");
    if (user.emailVerified === false) {
      throw new AppError(403, "Please verify your email before logging in.");
    }

    req.user = user;
    if (payload.sid) {
      req.sessionId = payload.sid;
      void touchLoginSessionActivity(payload.sid);
    }
    next();
  } catch (e) {
    if (e instanceof AppError) return next(e);
    next(new AppError(401, "Unauthorized"));
  }
}

/** Call after user status/permissions/profile mutations so auth cache stays correct. */
export function invalidateAuthUserCache(userId: string): void {
  authUserCache.delete(`user:${userId}`);
}
