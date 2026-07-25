import type { NextFunction, Request, Response } from "express";
import { isVelocityEnabledFlag } from "../../config/env.js";

/** Block Velocity API routes when the feature flag kill switch is off. */
export function requireVelocityEnabled(req: Request, res: Response, next: NextFunction): void {
  if (!isVelocityEnabledFlag()) {
    res.status(503).json({
      success: false,
      message: "Velocity integration is disabled (VELOCITY_ENABLED=false).",
      code: "VELOCITY_DISABLED",
      provider: "velocity",
    });
    return;
  }
  next();
}
