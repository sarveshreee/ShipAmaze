import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  CourierRateMaster,
  DEFAULT_WEIGHT_SLABS,
  type ICourierWeightSlab,
} from "../models/CourierRateMaster.js";
import { Courier } from "../models/Courier.js";

/** Standard partners for rate-master setup when DB couriers collection is empty. */
const SUGGESTED_COURIER_PARTNERS = [
  "Delhivery",
  "DTDC",
  "BlueDart",
  "Ekart",
  "Amazon",
  "Shadowfax",
  "Xpressbees",
] as const;

function mapRateMaster(doc: {
  _id: unknown;
  courierName: string;
  carrierId?: string;
  active: boolean;
  weightSlabs?: ICourierWeightSlab[];
  marginPercent?: number;
  priority?: number;
  slaDays?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(doc._id),
    courierName: doc.courierName,
    carrierId: doc.carrierId ?? "",
    active: doc.active,
    weightSlabs: (doc.weightSlabs ?? []).map((s) => ({
      weightKg: s.weightKg,
      weightLabel: s.weightLabel,
      prepaidRate: s.prepaidRate,
      codRate: s.codRate ?? 0,
    })),
    marginPercent: doc.marginPercent ?? null,
    priority: doc.priority ?? null,
    slaDays: doc.slaDays ?? null,
    notes: doc.notes ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function parseWeightSlabs(raw: unknown): ICourierWeightSlab[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(400, "weightSlabs must be a non-empty array");
  }
  const out: ICourierWeightSlab[] = [];
  const seen = new Set<number>();
  for (const row of raw) {
    const o = row as Record<string, unknown>;
    const weightKg = Number(o.weightKg);
    const weightLabel = String(o.weightLabel ?? "").trim();
    const prepaidRate = Number(o.prepaidRate);
    const codRate = o.codRate != null ? Number(o.codRate) : undefined;
    if (!(weightKg > 0) || !Number.isFinite(weightKg)) {
      throw new AppError(400, "Each weight slab needs weightKg > 0");
    }
    if (!weightLabel) throw new AppError(400, "Each weight slab needs weightLabel");
    if (!Number.isFinite(prepaidRate) || prepaidRate < 0) {
      throw new AppError(400, "Each weight slab needs prepaidRate ≥ 0");
    }
    if (codRate != null && (!Number.isFinite(codRate) || codRate < 0)) {
      throw new AppError(400, "codRate must be ≥ 0 when provided");
    }
    if (seen.has(weightKg)) throw new AppError(400, `Duplicate weight slab: ${weightKg} kg`);
    seen.add(weightKg);
    out.push({
      weightKg,
      weightLabel,
      prepaidRate,
      codRate: codRate ?? 0,
    });
  }
  return out.sort((a, b) => a.weightKg - b.weightKg);
}

export const listCourierRateMasters = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const rows = await CourierRateMaster.find().sort({ courierName: 1 }).lean();
  res.json({ items: rows.map(mapRateMaster) });
});

/** Read-only active courier rate masters for authenticated dropshippers/vendors. */
export const listPublicCourierRateMasters = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await CourierRateMaster.find({ active: { $ne: false } })
    .sort({ priority: 1, courierName: 1 })
    .lean();
  res.json({ items: rows.map(mapRateMaster) });
});

/** Active couriers from DB + rate masters for admin UI dropdowns */
export const listAvailableCouriers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const [couriers, rateMasters] = await Promise.all([
    Courier.find({ active: { $ne: false } }).sort({ priority: 1, name: 1 }).lean(),
    CourierRateMaster.find({ active: { $ne: false } }).sort({ courierName: 1 }).lean(),
  ]);
  const byName = new Map<
    string,
    {
      name: string;
      carrierId: string;
      source: "courier" | "rate_master" | "both" | "suggested";
      priority: number;
    }
  >();
  for (const c of couriers) {
    byName.set(c.name, {
      name: c.name,
      carrierId: String(c.carrierId ?? ""),
      source: "courier",
      priority: c.priority ?? 99,
    });
  }
  for (const r of rateMasters) {
    const existing = byName.get(r.courierName);
    if (existing) {
      if (!existing.carrierId && r.carrierId) existing.carrierId = r.carrierId;
      existing.source = existing.source === "courier" ? "both" : existing.source;
    } else {
      byName.set(r.courierName, {
        name: r.courierName,
        carrierId: String(r.carrierId ?? ""),
        source: "rate_master",
        priority: r.priority ?? 99,
      });
    }
  }
  for (const name of SUGGESTED_COURIER_PARTNERS) {
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        carrierId: "",
        source: "suggested",
        priority: 100,
      });
    }
  }
  res.json({
    items: [...byName.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)),
  });
});

export const getCourierRateMaster = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const row = await CourierRateMaster.findById(req.params.id).lean();
  if (!row) throw new AppError(404, "Courier rate master not found");
  res.json(mapRateMaster(row));
});

export const createCourierRateMaster = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const courierName = String(req.body?.courierName ?? "").trim();
  if (!courierName) throw new AppError(400, "courierName is required");

  const existing = await CourierRateMaster.findOne({ courierName }).lean();
  if (existing) throw new AppError(409, `Rate master already exists for ${courierName}`);

  const weightSlabs = Object.prototype.hasOwnProperty.call(req.body, "weightSlabs")
    ? parseWeightSlabs(req.body.weightSlabs)
    : DEFAULT_WEIGHT_SLABS;

  const doc = await CourierRateMaster.create({
    courierName,
    carrierId: String(req.body?.carrierId ?? "").trim(),
    active: req.body?.active !== false,
    weightSlabs,
    marginPercent: req.body?.marginPercent != null ? Number(req.body.marginPercent) : undefined,
    priority: req.body?.priority != null ? Number(req.body.priority) : undefined,
    slaDays: req.body?.slaDays != null ? Number(req.body.slaDays) : undefined,
    notes: String(req.body?.notes ?? ""),
  });
  res.status(201).json(mapRateMaster(doc.toObject()));
});

export const updateCourierRateMaster = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const patch: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "courierName")) {
    const courierName = String(req.body.courierName ?? "").trim();
    if (!courierName) throw new AppError(400, "courierName cannot be empty");
    patch.courierName = courierName;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "carrierId")) {
    patch.carrierId = String(req.body.carrierId ?? "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "active")) {
    patch.active = Boolean(req.body.active);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "weightSlabs")) {
    patch.weightSlabs = parseWeightSlabs(req.body.weightSlabs);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "marginPercent")) {
    const v = req.body.marginPercent;
    patch.marginPercent = v == null || v === "" ? undefined : Number(v);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "priority")) {
    const v = req.body.priority;
    patch.priority = v == null || v === "" ? undefined : Number(v);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "slaDays")) {
    const v = req.body.slaDays;
    patch.slaDays = v == null || v === "" ? undefined : Number(v);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    patch.notes = String(req.body.notes ?? "");
  }
  if (Object.keys(patch).length === 0) throw new AppError(400, "No fields to update");

  const doc = await CourierRateMaster.findByIdAndUpdate(req.params.id, { $set: patch }, {
    new: true,
    runValidators: true,
  });
  if (!doc) throw new AppError(404, "Courier rate master not found");
  res.json(mapRateMaster(doc.toObject()));
});

export const deleteCourierRateMaster = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const row = await CourierRateMaster.findByIdAndDelete(req.params.id);
  if (!row) throw new AppError(404, "Courier rate master not found");
  res.json({ ok: true });
});
