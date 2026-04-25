import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { User, type IUser } from "../models/User.js";
import { AppError } from "./errorMiddleware.js";

export interface AuthRequest extends Request {
  user?: IUser;
}

export async function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new AppError(401, "Unauthorized");

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user || user.status !== "active") throw new AppError(401, "Unauthorized");

    req.user = user;
    next();
  } catch (e) {
    if (e instanceof AppError) return next(e);
    next(new AppError(401, "Unauthorized"));
  }
}
