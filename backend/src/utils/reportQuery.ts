import mongoose from "mongoose";
import type { IUser } from "../models/User.js";
import { User } from "../models/User.js";
import { Vendor } from "../models/Vendor.js";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  buildOrderVisibilityQuery,
  buildOrderListFiltersQuery,
  buildTabQuery,
  mergeQueries,
  parseOrderListQuery,
  type ParsedOrderListQuery,
} from "./orderFilters.js";

export type { ParsedOrderListQuery };

/** Non-admins may only scope to themselves; admins may scope to any vendor/dropshipper user id. */
export async function resolveReportScopeFilter(user: IUser, scopeUserIdRaw: string | undefined): Promise<Record<string, unknown>> {
  const scopeUserId = scopeUserIdRaw?.trim();
  if (!scopeUserId) {
    return await buildOrderVisibilityQuery(user);
  }
  if (!mongoose.isValidObjectId(scopeUserId)) throw new AppError(400, "Invalid scope user id");
  if (user.role !== "admin") {
    if (String(scopeUserId) !== String(user._id)) throw new AppError(403, "Cannot access another account's data");
    return await buildOrderVisibilityQuery(user);
  }
  const target = await User.findById(scopeUserId).lean();
  if (!target) throw new AppError(404, "User not found");
  if (target.role === "vendor") {
    const v = await Vendor.findOne({ userId: target._id });
    if (!v) return { _id: { $exists: false } };
    return { vendorId: v._id };
  }
  if (target.role === "dropshipper") {
    const uid = target._id as mongoose.Types.ObjectId;
    return { $or: [{ ownerUserId: uid }, { createdBy: uid }, { dropshipperId: uid }] };
  }
  throw new AppError(400, "Report scope user must be vendor or dropshipper");
}

export async function buildReportOrdersQuery(
  user: IUser,
  query: Record<string, unknown>
): Promise<{ query: Record<string, unknown>; pq: ParsedOrderListQuery }> {
  const pq = parseOrderListQuery(query);
  const scopeUserId = String(query.scopeUserId ?? "").trim() || undefined;
  let base = await resolveReportScopeFilter(user, scopeUserId);

  const view = String(query.view ?? "").toLowerCase();
  let q: Record<string, unknown> = { ...base };
  if (view === "junk") q = mergeQueries(q, { isJunk: true });
  else q = mergeQueries(q, { isJunk: { $ne: true } });

  if (view !== "junk" && pq.tab) {
    const tq = buildTabQuery(pq.tab);
    if (tq) q = mergeQueries(q, tq);
  }

  const listFilters = buildOrderListFiltersQuery(pq);
  if (listFilters) q = mergeQueries(q, listFilters);

  const shipmentsOnly = String(query.shipmentsOnly ?? "").toLowerCase();
  if (shipmentsOnly === "1" || shipmentsOnly === "true") {
    q = mergeQueries(q, { shipmentCreated: true });
  }

  return { query: q, pq };
}

export function csvEscape(cell: string | number | boolean | undefined | null): string {
  if (cell === undefined || cell === null) return "";
  const t = String(cell);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export function csvRow(cells: (string | number | boolean | undefined | null)[]): string {
  return cells.map(csvEscape).join(",") + "\n";
}

export function exportFilename(prefix: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `shipamaze-${prefix}-${y}-${m}-${day}-${hh}${mm}${ss}.csv`;
}
