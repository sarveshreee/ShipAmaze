import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { AppError } from "../middleware/errorMiddleware.js";

export interface JwtPayload {
  sub: string;
  role: string;
}

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return "dev-secret-change-me";
}

export function signToken(payload: JwtPayload, expiresIn: SignOptions["expiresIn"] = "7d"): string {
  const opts: SignOptions = { expiresIn };
  return jwt.sign(payload, getJwtSecret(), opts);
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new AppError(401, "Token expired");
    if (e instanceof jwt.JsonWebTokenError) throw new AppError(401, "Invalid token");
    throw new AppError(401, "Unauthorized");
  }
}
