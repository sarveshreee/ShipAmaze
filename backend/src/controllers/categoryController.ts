import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Category, DEFAULT_CATEGORIES } from "../models/Category.js";
import { assertOwnerAdmin } from "../utils/staffPermissions.js";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureDefaultCategories() {
  const count = await Category.countDocuments();
  if (count > 0) return;
  await Category.insertMany(
    DEFAULT_CATEGORIES.map((c) => ({
      name: c.name,
      slug: c.slug,
      emoji: c.emoji ?? "",
      imageUrl: "",
      displayOrder: c.displayOrder ?? 0,
      enabled: c.enabled ?? true,
      defaultHsn: c.defaultHsn ?? "",
    }))
  );
}

function mapCategory(row: {
  _id: unknown;
  name: string;
  slug: string;
  emoji?: string;
  imageUrl?: string;
  displayOrder?: number;
  enabled?: boolean;
  defaultHsn?: string;
}) {
  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    emoji: row.emoji ?? "",
    imageUrl: row.imageUrl ?? "",
    displayOrder: row.displayOrder ?? 0,
    enabled: row.enabled !== false,
    defaultHsn: row.defaultHsn ?? "",
  };
}

/** Public list — enabled categories only, sorted by displayOrder. */
export const listCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await ensureDefaultCategories();
  const includeDisabled = req.user.role === "admin" && String(req.query.all) === "1";
  const filter = includeDisabled ? {} : { enabled: true };
  const rows = await Category.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
  res.json(rows.map(mapCategory));
});

const categoryBodySchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  emoji: z.string().optional(),
  imageUrl: z.string().optional(),
  displayOrder: z.number().optional(),
  enabled: z.boolean().optional(),
  defaultHsn: z.string().optional(),
});

function assertAdmin(req: AuthRequest) {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
}

export const createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  assertOwnerAdmin(req.user!);
  const body = categoryBodySchema.parse(req.body);
  const slug = body.slug?.trim() || slugify(body.name);
  const exists = await Category.findOne({ slug }).lean();
  if (exists) throw new AppError(409, "Category slug already exists");
  const doc = await Category.create({
    name: body.name.trim(),
    slug,
    emoji: body.emoji ?? "",
    imageUrl: body.imageUrl ?? "",
    displayOrder: body.displayOrder ?? 0,
    enabled: body.enabled !== false,
    defaultHsn: body.defaultHsn ?? "",
  });
  res.status(201).json(mapCategory(doc));
});

export const updateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  assertOwnerAdmin(req.user!);
  const body = categoryBodySchema.partial().parse(req.body);
  const doc = await Category.findByIdAndUpdate(
    req.params.id,
    {
      ...(body.name != null ? { name: body.name.trim() } : {}),
      ...(body.slug != null ? { slug: body.slug.trim().toLowerCase() } : {}),
      ...(body.emoji != null ? { emoji: body.emoji } : {}),
      ...(body.imageUrl != null ? { imageUrl: body.imageUrl } : {}),
      ...(body.displayOrder != null ? { displayOrder: body.displayOrder } : {}),
      ...(body.enabled != null ? { enabled: body.enabled } : {}),
      ...(body.defaultHsn != null ? { defaultHsn: body.defaultHsn } : {}),
    },
    { new: true }
  );
  if (!doc) throw new AppError(404, "Category not found");
  res.json(mapCategory(doc));
});

export const deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  assertOwnerAdmin(req.user!);
  const doc = await Category.findByIdAndDelete(req.params.id);
  if (!doc) throw new AppError(404, "Category not found");
  res.json({ ok: true });
});

export const seedCategoriesAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  assertOwnerAdmin(req.user!);
  await ensureDefaultCategories();
  const rows = await Category.find().sort({ displayOrder: 1 }).lean();
  res.json({ count: rows.length, categories: rows.map(mapCategory) });
});
