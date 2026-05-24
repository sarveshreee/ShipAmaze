import { Courier } from "../models/Courier.js";
import {
  CourierPriorityRule,
  type CourierPriorityRuleType,
  type ICourierPriorityEntry,
} from "../models/CourierPriorityRule.js";
import { firstItemArrayFromOrderDoc } from "../utils/orderLineItems.js";

export type CourierPriorityCandidate = {
  courierName: string;
  courierId?: string;
  source: string;
};

function parseWeightKg(raw: unknown): number | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/\bg\b/.test(s) && !/\bkg\b/.test(s)) return n / 1000;
  return n;
}

function weightMatchesBand(kg: number, band: string): boolean {
  const b = band.trim().toLowerCase();
  if (!b) return false;
  if (b.startsWith(">")) {
    const min = parseFloat(b.slice(1));
    return Number.isFinite(min) && kg > min;
  }
  if (b.startsWith("<")) {
    const max = parseFloat(b.slice(1));
    return Number.isFinite(max) && kg < max;
  }
  if (b.includes("-")) {
    const [a, c] = b.split("-").map((x) => parseFloat(x.trim()));
    if (Number.isFinite(a) && Number.isFinite(c)) return kg >= a && kg <= c;
  }
  const exact = parseFloat(b);
  if (Number.isFinite(exact)) return Math.abs(kg - exact) < 0.01;
  return false;
}

type LeanPriorityRule = {
  _id?: unknown;
  ruleType: CourierPriorityRuleType;
  matchValue: string;
  matchValueSecondary?: string;
  priorities?: ICourierPriorityEntry[];
  enabled: boolean;
  sortOrder?: number;
};

function ruleMatchesOrder(rule: LeanPriorityRule, ctx: {
  skus: string[];
  productNames: string[];
  weightKg: number | null;
  sellerId: string;
  vendorId: string;
}): boolean {
  const mv = rule.matchValue.trim().toLowerCase();
  if (!mv || !rule.enabled) return false;

  switch (rule.ruleType as CourierPriorityRuleType) {
    case "sku":
      return ctx.skus.some((s) => s.toLowerCase() === mv);
    case "productName":
      return ctx.productNames.some((n) => n.toLowerCase().includes(mv) || mv.includes(n.toLowerCase()));
    case "weight":
      return ctx.weightKg != null && weightMatchesBand(ctx.weightKg, rule.matchValue);
    case "sellerId":
      return ctx.sellerId.toLowerCase() === mv;
    case "vendorId":
      return ctx.vendorId.toLowerCase() === mv;
    default:
      return false;
  }
}

function prioritiesFromRule(rule: LeanPriorityRule): CourierPriorityCandidate[] {
  const sorted = [...(rule.priorities ?? [])].sort((a, b) => a.rank - b.rank);
  return sorted.map((p) => ({
    courierName: p.courierName,
    courierId: p.courierId,
    source: `rule:${rule.ruleType}:${rule.matchValue}`,
  }));
}

/**
 * Resolves courier assignment priority for an order.
 * Returns deduplicated candidates in evaluation order (rules first, then DB courier.priority).
 */
export async function resolveCourierPriorityForOrder(order: {
  weight?: string;
  createdBy?: unknown;
  ownerUserId?: unknown;
  vendorId?: unknown;
  orderItems?: unknown[];
  items?: unknown[];
  products?: unknown[];
  shopifyLineItems?: unknown[];
}): Promise<{ candidates: CourierPriorityCandidate[]; matchedRules: string[] }> {
  const lines = firstItemArrayFromOrderDoc(order);
  const skus = lines.map((l) => String(l.sku ?? "").trim()).filter(Boolean);
  const productNames = lines.map((l) => String(l.name ?? l.productName ?? "").trim()).filter(Boolean);
  const weightKg = parseWeightKg(order.weight);
  const sellerId = String(order.ownerUserId ?? order.createdBy ?? "");
  const vendorId = String(order.vendorId ?? "");

  const rules = await CourierPriorityRule.find({ enabled: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const ctx = { skus, productNames, weightKg, sellerId, vendorId };

  const candidates: CourierPriorityCandidate[] = [];
  const matchedRules: string[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    if (!ruleMatchesOrder(rule as LeanPriorityRule, ctx)) continue;
    matchedRules.push(String(rule._id));
    for (const c of prioritiesFromRule(rule as LeanPriorityRule)) {
      const key = `${c.courierName}::${c.courierId ?? ""}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(c);
    }
  }

  const couriers = await Courier.find({ active: true }).sort({ priority: 1 }).lean();
  for (const c of couriers) {
    const key = `${c.name}::`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      courierName: c.name,
      source: "courier_default_priority",
    });
  }

  return { candidates, matchedRules };
}

/** Pick first candidate name (caller may validate serviceability via Velocity rates). */
export async function resolvePreferredCourierName(order: Parameters<typeof resolveCourierPriorityForOrder>[0]): Promise<{
  courierName: string | null;
  candidates: CourierPriorityCandidate[];
  matchedRules: string[];
}> {
  const { candidates, matchedRules } = await resolveCourierPriorityForOrder(order);
  return {
    courierName: candidates[0]?.courierName ?? null,
    candidates,
    matchedRules,
  };
}
