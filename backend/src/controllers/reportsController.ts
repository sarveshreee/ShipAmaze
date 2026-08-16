import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { CodRemittance } from "../models/CodRemittance.js";
import { Invoice } from "../models/Invoice.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";
import { buildReportOrdersQuery, csvRow, exportFilename } from "../utils/reportQuery.js";
import { dashboardCache } from "../utils/ttlCache.js";
import { mongoCodCollectableExpr } from "../services/codMetrics.js";

const EXPORT_MAX_ROWS = 10_000;

export const getReportsSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { query } = await buildReportOrdersQuery(req.user, req.query as Record<string, unknown>);

  const [totalsAgg, byStatus, byCourier, byPayment, byZone] = await Promise.all([
    Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          shipmentCount: {
            $sum: { $cond: [{ $eq: ["$shipmentCreated", true] }, 1, 0] },
          },
          deliveredCount: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
        },
      },
    ]),
    Order.aggregate([{ $match: query }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $ifNull: ["$courier", ""] },
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    Order.aggregate([{ $match: query }, { $group: { _id: "$payment", count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $ifNull: ["$zone", ""] },
          count: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 40 },
    ]),
  ]);

  const t = totalsAgg[0] || {};
  res.json({
    orderCount: t.orderCount ?? 0,
    totalAmount: t.totalAmount ?? 0,
    shipmentCount: t.shipmentCount ?? 0,
    deliveredCount: t.deliveredCount ?? 0,
    deliveryRatePct:
      (t.orderCount ?? 0) > 0 ? Math.round(((t.deliveredCount ?? 0) / (t.orderCount ?? 1)) * 1000) / 10 : 0,
    byStatus: byStatus.map((r) => ({ status: r._id || "—", count: r.count })),
    byCourier: byCourier.map((r) => ({
      courier: String(r._id || "Unknown"),
      count: r.count,
      revenue: r.revenue ?? 0,
    })),
    byPayment: byPayment.map((r) => ({ payment: r._id || "—", count: r.count })),
    byZone: byZone.map((r) => ({
      zone: String(r._id || "Unspecified").trim() || "Unspecified",
      orders: r.count,
      delivered: r.delivered ?? 0,
      deliveryRatePct: r.count ? Math.round(((r.delivered ?? 0) / r.count) * 1000) / 10 : 0,
    })),
  });
});

function codScope(req: AuthRequest): Record<string, unknown> {
  if (req.user!.role === "admin") return {};
  return { userId: req.user!._id };
}

function invoiceScope(req: AuthRequest): Record<string, unknown> {
  if (req.user!.role === "admin") return {};
  return { userId: req.user!._id };
}

function walletScope(req: AuthRequest, scopeUserIdRaw: string | undefined): Record<string, unknown> {
  if (req.user!.role === "admin") {
    const s = scopeUserIdRaw?.trim();
    if (!s) return {};
    if (!mongoose.isValidObjectId(s)) throw new AppError(400, "Invalid scope user id");
    return { userId: new mongoose.Types.ObjectId(s) };
  }
  if (scopeUserIdRaw && String(scopeUserIdRaw) !== String(req.user!._id)) {
    throw new AppError(403, "Forbidden");
  }
  return { userId: req.user!._id };
}

export const exportCsv = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const type = String(req.query.type ?? "").toLowerCase();
  const scopeUserId = String(req.query.scopeUserId ?? "").trim() || undefined;

  if (!["orders", "shipments", "wallet", "cod", "invoices"].includes(type)) {
    throw new AppError(400, "type must be orders|shipments|wallet|cod|invoices");
  }

  const filename = exportFilename(type);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  if (type === "orders" || type === "shipments") {
    const q = { ...req.query, shipmentsOnly: type === "shipments" ? "true" : undefined } as Record<string, unknown>;
    const { query } = await buildReportOrdersQuery(req.user, q);
    res.write(
      csvRow([
        "orderId",
        "customer",
        "phone",
        "city",
        "state",
        "pincode",
        "courier",
        "payment",
        "status",
        "amount",
        "date",
        "awb",
        "shipmentCreated",
        "shipmentId",
        "trackingId",
        "channel",
        "externalSource",
        "sourceType",
      ])
    );
    let count = 0;
    let truncated = false;
    const cursor = Order.find(query).sort({ createdAt: -1 }).lean().cursor();
    for await (const o of cursor) {
      if (count >= EXPORT_MAX_ROWS) {
        truncated = true;
        break;
      }
      res.write(
        csvRow([
          o.orderId,
          o.customer,
          o.phone,
          o.city,
          o.state ?? "",
          o.pincode,
          o.courier,
          o.payment,
          o.status,
          o.amount,
          o.date,
          o.awb ?? "",
          o.shipmentCreated ? "yes" : "no",
          o.shipmentId ?? "",
          o.trackingId ?? "",
          o.channel ?? "",
          o.externalSource ?? "",
          o.sourceType ?? "",
        ])
      );
      count++;
    }
    if (truncated) res.write(csvRow(["__truncated__", `Export limited to ${EXPORT_MAX_ROWS} rows`]));
    res.end();
    return;
  }

  if (type === "wallet") {
    const filter = walletScope(req, scopeUserId);
    res.write(
      csvRow([
        "txnId",
        "date",
        "type",
        "amount",
        "balance",
        "status",
        "description",
        "ledgerType",
        "referenceType",
        "referenceId",
      ])
    );
    let count = 0;
    let truncated = false;
    const cursor = Transaction.find(filter).sort({ createdAt: -1 }).lean().cursor();
    for await (const t of cursor) {
      if (count >= EXPORT_MAX_ROWS) {
        truncated = true;
        break;
      }
      const createdAt = (t as { createdAt?: Date }).createdAt;
      const date =
        (t as { date?: string }).date ||
        (createdAt ? new Date(createdAt).toISOString().slice(0, 10) : "");
      res.write(
        csvRow([
          t.txnId,
          date,
          t.type,
          t.amount,
          t.balance,
          (t as { status?: string }).status ?? "",
          t.description ?? "",
          (t as { ledgerType?: string }).ledgerType ?? "",
          (t as { referenceType?: string }).referenceType ?? "",
          (t as { referenceId?: string }).referenceId ?? "",
        ])
      );
      count++;
    }
    if (truncated) res.write(csvRow(["__truncated__", `Export limited to ${EXPORT_MAX_ROWS} rows`]));
    res.end();
    return;
  }

  if (type === "cod") {
    const filter = codScope(req);
    res.write(
      csvRow([
        "remittanceId",
        "dropshipper",
        "ordersCount",
        "codAmount",
        "deductions",
        "netPayable",
        "status",
        "settleDate",
        "utr",
      ])
    );
    let count = 0;
    let truncated = false;
    const cursor = CodRemittance.find(filter).sort({ createdAt: -1 }).lean().cursor();
    for await (const c of cursor) {
      if (count >= EXPORT_MAX_ROWS) {
        truncated = true;
        break;
      }
      res.write(
        csvRow([
          c.remittanceId,
          c.dropshipper,
          c.ordersCount,
          c.codAmount,
          c.deductions,
          c.netPayable,
          c.status,
          c.settleDate,
          c.utr ?? "",
        ])
      );
      count++;
    }
    if (truncated) res.write(csvRow(["__truncated__", `Export limited to ${EXPORT_MAX_ROWS} rows`]));
    res.end();
    return;
  }

  if (type === "invoices") {
    const invFilter = { ...invoiceScope(req) };
    const status = String(req.query.status ?? "").trim();
    if (status) invFilter.status = status;
    const { parseYmdEnd, parseYmdStart } = await import("../utils/dateOnly.js");
    const dateFrom = parseYmdStart(req.query.dateFrom);
    const dateTo = parseYmdEnd(req.query.dateTo);
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.$gte = dateFrom;
      if (dateTo) range.$lte = dateTo;
      (invFilter as Record<string, unknown>).createdAt = range;
    }

    res.write(
      csvRow([
        "invoiceId",
        "date",
        "period",
        "ordersCount",
        "shippingCharges",
        "codCharges",
        "gst",
        "total",
        "status",
      ])
    );
    let count = 0;
    let truncated = false;
    const cursor = Invoice.find(invFilter).sort({ createdAt: -1 }).lean().cursor();
    for await (const inv of cursor) {
      if (count >= EXPORT_MAX_ROWS) {
        truncated = true;
        break;
      }
      res.write(
        csvRow([
          inv.invoiceId,
          inv.date,
          inv.period,
          inv.ordersCount,
          inv.shippingCharges,
          inv.codCharges,
          inv.gst,
          inv.total,
          inv.status,
        ])
      );
      count++;
    }
    if (truncated) res.write(csvRow(["__truncated__", `Export limited to ${EXPORT_MAX_ROWS} rows`]));
    res.end();
  }
});

/** Paginated orders for reports UI — same filters as listOrders but returns consistent shape. */
export const getReportsOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { query, pq } = await buildReportOrdersQuery(req.user, req.query as Record<string, unknown>);
  const skip = (pq.page - 1) * pq.pageSize;
  const [rows, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(pq.pageSize).lean(),
    Order.countDocuments(query),
  ]);
  res.json({
    orders: rows.map((o) => ({
      id: o.orderId,
      customer: o.customer,
      phone: o.phone,
      city: o.city,
      state: o.state,
      pincode: o.pincode,
      courier: o.courier,
      payment: o.payment,
      status: o.status,
      date: o.date,
      awb: o.awb,
      amount: o.amount,
      shipmentCreated: Boolean(o.shipmentCreated),
      shipmentId: o.shipmentId,
      trackingId: o.trackingId,
      channel: o.channel,
      externalSource: o.externalSource,
      sourceType: o.sourceType,
    })),
    total,
    page: pq.page,
    pageSize: pq.pageSize,
  });
});

/** GET /dashboard/summary — role-scoped KPIs for admin / vendor / dropshipper dashboards. */
export const getDashboardSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const role = req.user.role;
  if (role !== "admin" && role !== "vendor" && role !== "dropshipper") {
    throw new AppError(403, "Forbidden");
  }

  const cacheKey = `dash:${String(req.user._id)}:${role}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.json(cached);
    return;
  }

  const {
    buildDashboardMatch,
    countStatuses,
    istTodayRange,
    pct,
    productLineRevenueExpr,
    DASHBOARD_DELIVERED_STATUSES,
    DASHBOARD_RTO_STATUSES,
    DASHBOARD_NDR_STATUSES,
    DASHBOARD_IN_TRANSIT_STATUSES,
    DASHBOARD_PENDING_PICKUP_STATUSES,
    DASHBOARD_TO_PROCESS_STATUSES,
  } = await import("../utils/dashboardSummary.js");
  const { buildOrderVisibilityQuery, mergeQueries } = await import("../utils/orderFilters.js");

  const visibility = await buildOrderVisibilityQuery(req.user);
  const baseMatch = buildDashboardMatch(visibility);
  const { start: todayStart, end: todayEnd, ymd: todayYmd } = istTodayRange();

  const statsAggPromise = Order.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        deliveredCount: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_DELIVERED_STATUSES] }, 1, 0] },
        },
        rtoCount: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_RTO_STATUSES] }, 1, 0] },
        },
        ndrCount: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_NDR_STATUSES] }, 1, 0] },
        },
        totalOrderValue: { $sum: { $ifNull: ["$amount", 0] } },
        // Undelivered COD pipeline — prefer codCollectableAmount (partial payments).
        dashboardUndeliveredCODAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: [{ $toUpper: { $ifNull: ["$payment", ""] } }, "COD"] },
                  { $not: [{ $in: ["$status", DASHBOARD_DELIVERED_STATUSES] }] },
                ],
              },
              mongoCodCollectableExpr(),
              0,
            ],
          },
        },
        /** @deprecated alias — use dashboardUndeliveredCODAmount */
        codPendingAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: [{ $toUpper: { $ifNull: ["$payment", ""] } }, "COD"] },
                  { $not: [{ $in: ["$status", DASHBOARD_DELIVERED_STATUSES] }] },
                ],
              },
              mongoCodCollectableExpr(),
              0,
            ],
          },
        },
      },
    },
  ]);

  const byStatusPromise = Order.aggregate([
    { $match: baseMatch },
    { $group: { _id: { $ifNull: ["$status", "other"] }, value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $project: { _id: 0, name: "$_id", value: 1 } },
  ]);

  const byCourierPromise = Order.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: { $ifNull: ["$courier", "Unknown"] },
        delivered: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_DELIVERED_STATUSES] }, 1, 0] },
        },
        ndr: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_NDR_STATUSES] }, 1, 0] },
        },
        rto: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_RTO_STATUSES] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 12 },
    { $project: { _id: 0, name: "$_id", delivered: 1, ndr: 1, rto: 1, total: 1 } },
  ]);

  const recentPromise = Order.find(baseMatch)
    .sort({ createdAt: -1 })
    .limit(15)
    .select("orderId customer status courier courierName payment date awb weight")
    .lean();

  const deliveredTodayPromise = Order.countDocuments(
    mergeQueries(baseMatch, {
      status: { $in: DASHBOARD_DELIVERED_STATUSES },
      $or: [
        { date: { $regex: `^${todayYmd}` } },
        { updatedAt: { $gte: todayStart, $lte: todayEnd } },
      ],
    })
  );

  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const ordersOverTimePromise = Order.aggregate([
    {
      $match: {
        $and: [baseMatch, { createdAt: { $gte: weekStart } }],
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: { $ifNull: ["$createdAt", "$updatedAt"] },
            timezone: "Asia/Kolkata",
          },
        },
        total: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_DELIVERED_STATUSES] }, 1, 0] },
        },
        rto: {
          $sum: { $cond: [{ $in: ["$status", DASHBOARD_RTO_STATUSES] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: "$_id", total: 1, delivered: 1, rto: 1 } },
  ]);

  const adminExtras =
    role === "admin"
      ? Promise.all([
          User.countDocuments({ role: "vendor", status: "active" }),
          User.countDocuments({ role: "dropshipper", status: "active" }),
          Order.aggregate([
            { $match: { ...baseMatch, status: { $nin: ["cancelled", "junk"] } } },
            { $unwind: { path: "$products", preserveNullAndEmptyArrays: false } },
            {
              $addFields: {
                productLabel: {
                  $trim: {
                    input: {
                      $ifNull: [
                        "$products.name",
                        { $ifNull: ["$products.productName", "$products.title"] },
                      ],
                    },
                  },
                },
              },
            },
            { $match: { productLabel: { $nin: [null, ""] } } },
            {
              $group: {
                _id: "$productLabel",
                orderCount: { $sum: 1 },
                revenue: { $sum: productLineRevenueExpr() },
              },
            },
            { $sort: { orderCount: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, name: "$_id", orderCount: 1, revenue: 1 } },
          ]),
          Order.aggregate([
            {
              $match: {
                ...baseMatch,
                status: { $nin: ["cancelled", "junk"] },
                vendorId: { $exists: true, $ne: null },
              },
            },
            {
              $group: {
                _id: "$vendorId",
                orderCount: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$amount", 0] } },
              },
            },
            { $sort: { orderCount: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: "vendors",
                localField: "_id",
                foreignField: "_id",
                as: "vendor",
              },
            },
            { $addFields: { vendorDoc: { $arrayElemAt: ["$vendor", 0] } } },
            {
              $lookup: {
                from: "users",
                localField: "vendorDoc.userId",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $project: {
                _id: 0,
                name: {
                  $ifNull: ["$vendorDoc.name", { $arrayElemAt: ["$user.name", 0] }, "Unknown"],
                },
                email: {
                  $ifNull: ["$vendorDoc.email", { $arrayElemAt: ["$user.email", 0] }, ""],
                },
                orderCount: 1,
                revenue: 1,
              },
            },
          ]),
          Order.aggregate([
            {
              $match: {
                ...baseMatch,
                status: { $nin: ["cancelled", "junk"] },
                dropshipperId: { $exists: true, $ne: null },
              },
            },
            {
              $group: {
                _id: "$dropshipperId",
                orderCount: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$amount", 0] } },
              },
            },
            { $sort: { orderCount: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $project: {
                _id: 0,
                name: { $ifNull: [{ $arrayElemAt: ["$user.name", 0] }, "Unknown"] },
                email: { $ifNull: [{ $arrayElemAt: ["$user.email", 0] }, ""] },
                orderCount: 1,
                revenue: 1,
              },
            },
          ]),
          Order.aggregate([
            { $match: baseMatch },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: { $ifNull: ["$createdAt", "$updatedAt"] },
                    timezone: "Asia/Kolkata",
                  },
                },
                total: { $sum: 1 },
                delivered: {
                  $sum: { $cond: [{ $in: ["$status", DASHBOARD_DELIVERED_STATUSES] }, 1, 0] },
                },
                rto: {
                  $sum: { $cond: [{ $in: ["$status", DASHBOARD_RTO_STATUSES] }, 1, 0] },
                },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 30 },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: "$_id", total: 1, delivered: 1, rto: 1 } },
          ]),
        ])
      : Promise.resolve(null);

  const [statsAgg, byStatusAgg, byCourierAgg, recentOrders, deliveredToday, ordersThisWeek, admin] =
    await Promise.all([
      statsAggPromise,
      byStatusPromise,
      byCourierPromise,
      recentPromise,
      deliveredTodayPromise,
      ordersOverTimePromise,
      adminExtras,
    ]);

  const totals = statsAgg[0] ?? {
    totalOrders: 0,
    deliveredCount: 0,
    rtoCount: 0,
    ndrCount: 0,
    totalOrderValue: 0,
    dashboardUndeliveredCODAmount: 0,
    codPendingAmount: 0,
  };
  const totalOrders = totals.totalOrders ?? 0;
  const deliveredCount = totals.deliveredCount ?? 0;
  const rtoCount = totals.rtoCount ?? 0;
  const ndrCount = totals.ndrCount ?? 0;
  const undeliveredCod =
    totals.dashboardUndeliveredCODAmount ?? totals.codPendingAmount ?? 0;

  const payload: Record<string, unknown> = {
    role,
    totalOrders,
    deliveredCount,
    rtoCount,
    ndrCount,
    rtoPct: pct(rtoCount, totalOrders),
    ndrPct: pct(ndrCount, totalOrders),
    deliveryRatePct: pct(deliveredCount, totalOrders),
    totalOrderValue: totals.totalOrderValue ?? 0,
    /** Undelivered COD pipeline (not remittance settlement). */
    dashboardUndeliveredCODAmount: undeliveredCod,
    /** @deprecated use dashboardUndeliveredCODAmount */
    codPendingAmount: undeliveredCod,
    deliveredToday,
    toProcess: countStatuses(byStatusAgg, DASHBOARD_TO_PROCESS_STATUSES),
    pickupsPending: countStatuses(byStatusAgg, DASHBOARD_PENDING_PICKUP_STATUSES),
    inTransit: countStatuses(byStatusAgg, DASHBOARD_IN_TRANSIT_STATUSES),
    pending:
      countStatuses(byStatusAgg, DASHBOARD_TO_PROCESS_STATUSES) +
      countStatuses(byStatusAgg, DASHBOARD_PENDING_PICKUP_STATUSES),
    ordersByStatus: byStatusAgg,
    courierPerformance: byCourierAgg,
    ordersThisWeek,
    ordersOverTime: role === "admin" && admin ? admin[5] : ordersThisWeek,
    recentOrders: recentOrders.map((o) => ({
      id: String(o.orderId ?? ""),
      customer: String(o.customer ?? ""),
      status: String(o.status ?? ""),
      courier: String(o.courierName ?? o.courier ?? ""),
      payment: String(o.payment ?? ""),
      date: String(o.date ?? ""),
      awb: String(o.awb ?? ""),
      weight: o.weight != null ? String(o.weight) : "",
    })),
    today: todayYmd,
  };

  if (role === "admin" && admin) {
    const [activeVendors, activeDropshippers, topProducts, topVendors, topDropshippers] = admin;
    payload.activeVendors = activeVendors;
    payload.activeDropshippers = activeDropshippers;
    payload.topProducts = topProducts;
    payload.topVendors = topVendors;
    payload.topDropshippers = topDropshippers;
  }

  dashboardCache.set(cacheKey, payload);
  res.setHeader("X-Cache", "MISS");
  res.json(payload);
});
