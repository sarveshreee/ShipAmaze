import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  CourierPriorityRule,
  type CourierPriorityRuleType,
  type ICourierPriorityEntry,
} from "../models/CourierPriorityRule.js";
import { resolveCourierPriorityForOrder } from "../services/courierPriorityService.js";
import { Order } from "../models/Order.js";

const RULE_TYPES = new Set<CourierPriorityRuleType>([
  "sku",
  "weight",
  "productName",
  "sellerId",
  "vendorId",
]);

function mapRule(doc: {
  _id: unknown;
  ruleType: string;
  matchValue: string;
  matchValueSecondary?: string;
  priorities?: ICourierPriorityEntry[];
  enabled: boolean;
  sortOrder: number;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(doc._id),
    ruleType: doc.ruleType,
    matchValue: doc.matchValue,
    matchValueSecondary: doc.matchValueSecondary ?? "",
    priorities: (doc.priorities ?? []).map((p) => ({
      courierName: p.courierName,
      courierId: p.courierId ?? "",
      rank: p.rank,
    })),
    enabled: doc.enabled,
    sortOrder: doc.sortOrder,
    note: doc.note ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function parsePriorities(raw: unknown): ICourierPriorityEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(400, "priorities must be a non-empty array");
  }
  const out: ICourierPriorityEntry[] = [];
  for (const row of raw) {
    const o = row as Record<string, unknown>;
    const courierName = String(o.courierName ?? "").trim();
    const rank = Number(o.rank);
    if (!courierName) throw new AppError(400, "Each priority entry needs courierName");
    if (!Number.isFinite(rank) || rank < 1) throw new AppError(400, "Each priority entry needs rank ≥ 1");
    out.push({
      courierName,
      courierId: String(o.courierId ?? "").trim() || undefined,
      rank,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export const listCourierPriorityRules = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const ruleType = String(req.query.ruleType ?? "").trim();
  const q: Record<string, unknown> = {};
  if (ruleType && RULE_TYPES.has(ruleType as CourierPriorityRuleType)) q.ruleType = ruleType;
  const rows = await CourierPriorityRule.find(q).sort({ sortOrder: 1, createdAt: 1 }).lean();
  res.json({ items: rows.map(mapRule) });
});

export const createCourierPriorityRule = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const body = req.body as Record<string, unknown>;
  const ruleType = String(body.ruleType ?? "").trim() as CourierPriorityRuleType;
  if (!RULE_TYPES.has(ruleType)) throw new AppError(400, "Invalid ruleType");
  const matchValue = String(body.matchValue ?? "").trim();
  if (!matchValue) throw new AppError(400, "matchValue is required");
  const priorities = parsePriorities(body.priorities);
  const maxSort = await CourierPriorityRule.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
  const doc = await CourierPriorityRule.create({
    ruleType,
    matchValue,
    matchValueSecondary: String(body.matchValueSecondary ?? "").trim() || undefined,
    priorities,
    enabled: body.enabled !== false,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : (maxSort?.sortOrder ?? 0) + 1,
    note: String(body.note ?? "").trim() || undefined,
  });
  res.status(201).json(mapRule(doc.toObject()));
});

export const updateCourierPriorityRule = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const doc = await CourierPriorityRule.findById(req.params.id);
  if (!doc) throw new AppError(404, "Rule not found");
  const body = req.body as Record<string, unknown>;
  if (body.ruleType !== undefined) {
    const rt = String(body.ruleType).trim() as CourierPriorityRuleType;
    if (!RULE_TYPES.has(rt)) throw new AppError(400, "Invalid ruleType");
    doc.ruleType = rt;
  }
  if (body.matchValue !== undefined) {
    const mv = String(body.matchValue).trim();
    if (!mv) throw new AppError(400, "matchValue cannot be empty");
    doc.matchValue = mv;
  }
  if (body.matchValueSecondary !== undefined) {
    doc.matchValueSecondary = String(body.matchValueSecondary).trim() || undefined;
  }
  if (body.priorities !== undefined) doc.priorities = parsePriorities(body.priorities);
  if (body.enabled !== undefined) doc.enabled = body.enabled === true;
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
    doc.sortOrder = Number(body.sortOrder);
  }
  if (body.note !== undefined) doc.note = String(body.note).trim() || undefined;
  await doc.save();
  res.json(mapRule(doc.toObject()));
});

export const deleteCourierPriorityRule = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const doc = await CourierPriorityRule.findByIdAndDelete(req.params.id);
  if (!doc) throw new AppError(404, "Rule not found");
  res.json({ ok: true });
});

export const reorderCourierPriorityRules = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const ids = (req.body as { orderedIds?: unknown }).orderedIds;
  if (!Array.isArray(ids) || ids.length === 0) throw new AppError(400, "orderedIds required");
  await Promise.all(
    ids.map((id, idx) =>
      CourierPriorityRule.updateOne({ _id: String(id) }, { $set: { sortOrder: idx } })
    )
  );
  res.json({ ok: true });
});

/** Debug/evaluate priority for an order (admin). */
export const evaluateCourierPriority = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const orderId = String(req.query.orderId ?? req.body?.orderId ?? "").trim();
  if (!orderId) throw new AppError(400, "orderId required");
  const order = await Order.findOne({ orderId }).lean();
  if (!order) throw new AppError(404, "Order not found");
  const result = await resolveCourierPriorityForOrder(order);
  res.json(result);
});
