/**
 * Tab / date-type aware sort key for order lists.
 * Matches the timestamp shown on each row (newest date+time first).
 */

export type ListDateType = "placed" | "pickup" | "delivered" | "choose" | undefined;

function statusHistoryTimeExpr(pattern: string, mode: "max" | "min"): Record<string, unknown> {
  return {
    $let: {
      vars: {
        matches: {
          $filter: {
            input: { $ifNull: ["$statusHistory", []] },
            as: "h",
            cond: {
              $regexMatch: {
                input: { $toString: { $ifNull: ["$$h.status", ""] } },
                regex: pattern,
                options: "i",
              },
            },
          },
        },
      },
      in: {
        $cond: [
          { $gt: [{ $size: "$$matches" }, 0] },
          mode === "max" ? { $max: "$$matches.at" } : { $min: "$$matches.at" },
          null,
        ],
      },
    },
  };
}

/** Nested $ifNull chain (MongoDB $ifNull only accepts 2 args). */
function coalesce(...exprs: unknown[]): Record<string, unknown> {
  if (exprs.length < 2) {
    return { $ifNull: [exprs[0] ?? null, null] };
  }
  if (exprs.length === 2) {
    return { $ifNull: [exprs[0], exprs[1]] };
  }
  return { $ifNull: [exprs[0], coalesce(...exprs.slice(1))] };
}

/** Processed / AWB time — Date Type "placed" & pending-pickup tab. */
function processedAtExpr(): Record<string, unknown> {
  return coalesce(
    "$assignedDateTime",
    statusHistoryTimeExpr(
      "pending[_\\s-]?pickup|shipment[_\\s-]?booked|pickup[_\\s-]?scheduled|ready[_\\s-]?for[_\\s-]?pickup",
      "min"
    ),
    "$movedToReadyAt",
    "$createdAt"
  );
}

/** Courier pick-up / in-transit time — Date Type "pickup" & in-transit tab. */
function pickedUpAtExpr(): Record<string, unknown> {
  return coalesce(
    "$pickupDate",
    statusHistoryTimeExpr("picked[_\\s-]?up", "min"),
    statusHistoryTimeExpr("in[_\\s-]?transit", "min"),
    "$createdAt"
  );
}

function deliveredAtExpr(): Record<string, unknown> {
  return coalesce(statusHistoryTimeExpr("^delivered$", "max"), "$createdAt");
}

function outForDeliveryAtExpr(): Record<string, unknown> {
  return coalesce(
    statusHistoryTimeExpr("out[_\\s-]?for[_\\s-]?delivery", "max"),
    "$createdAt"
  );
}

function failedAtExpr(): Record<string, unknown> {
  return coalesce(
    statusHistoryTimeExpr("failed|rto|ndr|cancelled|canceled|booking[_\\s-]?failed", "max"),
    "$createdAt"
  );
}

function createdAtExpr(): Record<string, unknown> {
  return coalesce("$createdAt", "$date");
}

/**
 * Aggregation expression for `_listSortAt` — same semantics as frontend orderTimestampForTab.
 */
export function orderListSortAtExpr(
  tab?: string,
  dateType?: ListDateType
): Record<string, unknown> {
  if (dateType === "placed") return processedAtExpr();
  if (dateType === "pickup") return pickedUpAtExpr();
  if (dateType === "delivered") return deliveredAtExpr();

  const t = String(tab ?? "")
    .toLowerCase()
    .replace(/_/g, "-");

  switch (t) {
    case "pending-pickup":
      return processedAtExpr();
    case "in-transit":
      return pickedUpAtExpr();
    case "out-for-delivery":
      return outForDeliveryAtExpr();
    case "delivered":
      return deliveredAtExpr();
    case "failed":
    case "ndr":
    case "rto":
      return failedAtExpr();
    default:
      return createdAtExpr();
  }
}

export const ORDER_LIST_SORT_FIELDS = {
  _listSortAt: -1 as const,
  createdAt: -1 as const,
  _id: -1 as const,
};

export const ORDER_LIST_CREATED_AT_SORT = {
  createdAt: -1 as const,
  _id: -1 as const,
};

/** Heavy fields excluded from order list payloads. */
export const ORDER_LIST_UNSET_FIELDS = [
  "_listSortAt",
  "labelPdfBase64",
  "labelPdf",
  "providerBookingRaw",
  "providerEvents",
  "trackingActivities",
  "remarkHistory",
  "rawWebhook",
  "shopifyRawPayload",
] as const;

/** Status-history $filter sort is only needed for shipment-timeline tabs / date types. */
export function orderListNeedsComputedSort(tab?: string, dateType?: ListDateType): boolean {
  if (dateType === "placed" || dateType === "pickup" || dateType === "delivered") return true;
  const t = String(tab ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  return (
    t === "pending-pickup" ||
    t === "in-transit" ||
    t === "out-for-delivery" ||
    t === "delivered" ||
    t === "failed" ||
    t === "ndr" ||
    t === "rto"
  );
}
