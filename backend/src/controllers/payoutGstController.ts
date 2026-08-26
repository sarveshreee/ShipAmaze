import type { Response } from "express";
import multer from "multer";
import mongoose from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { PayoutSummaryOverride } from "../models/PayoutSummaryOverride.js";
import { GstUploadRecord } from "../models/GstUploadRecord.js";
import { parseGstExcelBuffer } from "../services/gstExcelParse.js";

function toObjectId(id: string | undefined | null) {
  if (!id || !mongoose.isValidObjectId(id)) return undefined;
  return new mongoose.Types.ObjectId(id);
}

export const gstExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname ?? "").toLowerCase();
    const ok =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      name.endsWith(".csv") ||
      file.mimetype.includes("sheet") ||
      file.mimetype.includes("excel") ||
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel";
    if (!ok) {
      cb(new AppError(400, "Upload an Excel (.xlsx/.xls) or CSV file"));
      return;
    }
    cb(null, true);
  },
});

function requireImpersonation(req: AuthRequest) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (!req.impersonation) {
    throw new AppError(403, "Payout edits are only available while impersonating a user as admin");
  }
}

function serializeOverride(doc: {
  nextCodOn?: string | null;
  pendingCod?: number | null;
  upcomingPayouts?: number | null;
  totalSettled?: number | null;
  pendingSettlement?: number | null;
  last7Days?: number | null;
  last30Days?: number | null;
  updatedAt?: Date;
} | null) {
  if (!doc) {
    return {
      nextCodOn: null,
      pendingCod: null,
      upcomingPayouts: null,
      totalSettled: null,
      pendingSettlement: null,
      last7Days: null,
      last30Days: null,
      updatedAt: null,
    };
  }
  return {
    nextCodOn: doc.nextCodOn ?? null,
    pendingCod: doc.pendingCod ?? null,
    upcomingPayouts: doc.upcomingPayouts ?? null,
    totalSettled: doc.totalSettled ?? null,
    pendingSettlement: doc.pendingSettlement ?? null,
    last7Days: doc.last7Days ?? null,
    last30Days: doc.last30Days ?? null,
    updatedAt: doc.updatedAt?.toISOString?.() ?? null,
  };
}

export const getPayoutSummaryOverrides = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await PayoutSummaryOverride.findOne({ userId: req.user._id }).lean();
  res.json({ data: serializeOverride(doc) });
});

const NUMERIC_KEYS = [
  "pendingCod",
  "upcomingPayouts",
  "totalSettled",
  "pendingSettlement",
  "last7Days",
  "last30Days",
] as const;

export const upsertPayoutSummaryOverrides = asyncHandler(async (req: AuthRequest, res: Response) => {
  requireImpersonation(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const $set: Record<string, unknown> = {
    updatedBy: toObjectId(req.impersonation!.impersonatedBy) ?? req.user!._id,
  };

  if ("nextCodOn" in body) {
    const v = body.nextCodOn;
    $set.nextCodOn = v == null || v === "" ? null : String(v).trim();
  }

  for (const key of NUMERIC_KEYS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw == null || raw === "") {
      $set[key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new AppError(400, `Invalid number for ${key}`);
    $set[key] = Math.round(n * 100) / 100;
  }

  const doc = await PayoutSummaryOverride.findOneAndUpdate(
    { userId: req.user!._id },
    { $set, $setOnInsert: { userId: req.user!._id } },
    { upsert: true, new: true }
  ).lean();

  res.json({ success: true, data: serializeOverride(doc) });
});

export const listUploadedGstRecords = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const raw = req.query as Record<string, unknown>;
  const search = String(raw.search ?? raw.q ?? "").trim().toLowerCase();
  const limit = Math.min(5_000, Math.max(1, parseInt(String(raw.limit ?? "500"), 10) || 500));

  const q: Record<string, unknown> = { userId: req.user._id };
  if (search) {
    q.$or = [
      { orderId: { $regex: search, $options: "i" } },
      { customer: { $regex: search, $options: "i" } },
    ];
  }

  const rows = await GstUploadRecord.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  const items = rows.map((r) => ({
    orderId: r.orderId,
    date: r.date,
    customer: r.customer,
    amount: r.amount,
    gstPct: r.gstPct,
    gstAmount: r.gstAmount,
    taxableValue: r.taxableValue,
    total: r.total,
    payment: (r.payment === "Prepaid" ? "Prepaid" : "COD") as "COD" | "Prepaid",
    status: (["Pending", "Processed", "Settled"].includes(String(r.status))
      ? r.status
      : r.status === "Delivered"
        ? "Settled"
        : "Processed") as "Pending" | "Processed" | "Settled",
  }));

  res.json({ items, total: items.length });
});

export const uploadGstExcel = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const file = req.file;
  if (!file?.buffer?.length) throw new AppError(400, "Excel file is required");

  const parsed = parseGstExcelBuffer(file.buffer);
  if (parsed.length === 0) {
    throw new AppError(400, "No valid GST rows found. Check headers like Order ID, Consignee, TP (INC GST), GST.");
  }

  const replaceAll = String((req.body as { replace?: string })?.replace ?? "true").toLowerCase() !== "false";
  if (replaceAll) {
    await GstUploadRecord.deleteMany({ userId: req.user._id });
  }

  const uploadedBy =
    toObjectId(req.impersonation?.impersonatedBy) ?? req.user._id;
  const sourceFileName = file.originalname;

  const ops = parsed.map((row) => ({
    updateOne: {
      filter: { userId: req.user!._id, orderId: row.orderId },
      update: {
        $set: {
          ...row,
          uploadedBy,
          sourceFileName,
        },
        $setOnInsert: { userId: req.user!._id },
      },
      upsert: true,
    },
  }));

  if (ops.length) await GstUploadRecord.bulkWrite(ops, { ordered: false });

  res.json({
    success: true,
    message: `Imported ${parsed.length} GST row(s)`,
    data: { imported: parsed.length, replaced: replaceAll },
  });
});
