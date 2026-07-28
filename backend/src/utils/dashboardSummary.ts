import mongoose from "mongoose";
import { mergeQueries } from "./orderFilters.js";
import { parseYmdEnd, parseYmdStart } from "./dateOnly.js";

/** YYYY-MM-DD in Asia/Kolkata. */
export function istTodayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function istTodayRange(now = new Date()): { start: Date; end: Date; ymd: string } {
  const ymd = istTodayYmd(now);
  const start = parseYmdStart(ymd)!;
  const end = parseYmdEnd(ymd)!;
  return { start, end, ymd };
}

/** Combine visibility scope with non-junk filter for dashboard aggregates. */
export function buildDashboardMatch(visibility: Record<string, unknown>): Record<string, unknown> {
  if (!visibility || Object.keys(visibility).length === 0) {
    return { isJunk: { $ne: true } };
  }
  return mergeQueries(visibility, { isJunk: { $ne: true } });
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export const DASHBOARD_DELIVERED_STATUSES = ["delivered", "Delivered"];
export const DASHBOARD_RTO_STATUSES = ["rto", "RTO"];
export const DASHBOARD_NDR_STATUSES = ["ndr", "NDR", "ndr_raised", "NDR raised"];

export const DASHBOARD_IN_TRANSIT_STATUSES = [
  "in_transit",
  "in-transit",
  "In Transit",
  "out_for_delivery",
  "out-for-delivery",
  "Out for Delivery",
  "picked_up",
  "picked-up",
  "Picked Up",
];

export const DASHBOARD_PENDING_PICKUP_STATUSES = [
  "pending_pickup",
  "pending-pickup",
  "Pending Pickup",
  "pickup_scheduled",
  "pickup-scheduled",
  "Pickup Scheduled",
  "not-picked",
  "not_picked",
];

export const DASHBOARD_TO_PROCESS_STATUSES = [
  "draft",
  "pending",
  "Pending",
  "ready_to_ship",
  "ready-to-ship",
  "Ready to Ship",
  "on-process",
  "on_process",
];

export function countStatuses(byStatus: Array<{ name: string; value: number }>, allowed: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "-");
  const set = new Set(allowed.map(norm));
  return byStatus.reduce((sum, row) => {
    const key = norm(String(row.name ?? ""));
    return set.has(key) ? sum + (row.value || 0) : sum;
  }, 0);
}

/** Product line qty/price with legacy field fallbacks. */
export function productLineRevenueExpr(): Record<string, unknown> {
  return {
    $multiply: [
      {
        $ifNull: [
          "$products.price",
          { $ifNull: ["$products.sellingPrice", { $ifNull: ["$products.unitPrice", 0] }] },
        ],
      },
      {
        $max: [
          {
            $ifNull: [
              "$products.qty",
              { $ifNull: ["$products.quantity", { $ifNull: ["$products.qtyOrdered", 1] }] },
            ],
          },
          1,
        ],
      },
    ],
  };
}

export function isValidObjectIdString(id: unknown): boolean {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}
