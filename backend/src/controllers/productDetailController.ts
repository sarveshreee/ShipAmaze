import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { Product } from "../models/Product.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";

export const getProductById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await Product.findById(req.params.id).lean();
  if (!p) throw new AppError(404, "Not found");
  res.json(p);
});

export const getProductVariants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await Product.findById(req.params.id).lean();
  if (!p) throw new AppError(404, "Not found");
  res.json(Array.isArray(p.variants) ? p.variants : []);
});
