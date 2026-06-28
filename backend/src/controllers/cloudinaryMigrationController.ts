import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  runCloudinaryMigrationBatch,
  verifyCloudinaryMigration,
} from "../services/cloudinaryMigration.service.js";

export const test = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    message: "Migration route is working",
  });
});

export const status = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    migrationEnabled: process.env.CLOUDINARY_MIGRATION_ENABLED?.trim().toLowerCase() === "true",
    cloudinaryConfigured: Boolean(
      process.env.CLOUDINARY_CLOUD_NAME?.trim()
        && process.env.CLOUDINARY_API_KEY?.trim()
        && process.env.CLOUDINARY_API_SECRET?.trim()
    ),
    renderServiceUrl: process.env.RENDER_EXTERNAL_URL ?? null,
    gitCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
  });
});

function publicBaseUrl(req: AuthRequest): string {
  const configured =
    process.env.PUBLIC_BACKEND_URL?.trim()
    || process.env.API_PUBLIC_URL?.trim()
    || process.env.RENDER_EXTERNAL_URL?.trim();
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

function requireCloudinaryMigrationEnabled(): void {
  if (process.env.CLOUDINARY_MIGRATION_ENABLED?.trim().toLowerCase() !== "true") {
    throw new AppError(403, "Cloudinary migration endpoint is disabled");
  }
}

export const runBatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  requireCloudinaryMigrationEnabled();

  const body = req.body as { limit?: unknown; after?: unknown };
  const limit = Number(body.limit ?? req.query.limit ?? 5);
  const after = String(body.after ?? req.query.after ?? "").trim() || undefined;

  const result = await runCloudinaryMigrationBatch({
    limit: Number.isFinite(limit) ? limit : 5,
    after,
    publicBaseUrl: publicBaseUrl(req),
    requestedBy: String(req.user._id),
  });

  res.json(result);
});

export const verify = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  requireCloudinaryMigrationEnabled();
  const limit = Number(req.query.limit ?? 50);
  res.json(await verifyCloudinaryMigration(Number.isFinite(limit) ? limit : 50));
});
