/**
 * Ekart tracking — POST /v2/shipments/track → ProviderTrackingResult.
 *
 * Durin TrackResponseV2 is keyed by tracking id; `history` is usually newest-first.
 * Prefer the highest-progress machine `history[].status` (date tie-break) so
 * oldest-first payloads do not trap orders on shipment_created. Keep
 * `public_description` on timeline activities for UI.
 */

import type {
  ProviderTrackInput,
  ProviderTrackingActivity,
  ProviderTrackingResult,
} from "../courier/types.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import {
  mapEkartStatusToProviderCanonical,
  type ProviderCanonicalStatus,
} from "../courier/statusNormalize.js";
import { ekartConfig } from "./ekart.config.js";
import { ekartPost } from "./ekart.client.js";
import {
  recordEkartTrackAttempt,
  recordEkartTrackFailure,
  recordEkartTrackSuccess,
} from "./ekart.metrics.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const PROVIDER_PROGRESS_RANK: Record<ProviderCanonicalStatus, number> = {
  CREATED: 10,
  PICKED_UP: 30,
  IN_TRANSIT: 35,
  OUT_FOR_DELIVERY: 45,
  FAILED: 50,
  CANCELLED: 55,
  RETURNED: 60,
  LOST: 60,
  DELIVERED: 70,
};

function historyEventDateMs(row: Record<string, unknown>): number {
  const raw = row.event_date_iso8601 ?? row.event_date ?? row.updated_datetime ?? row.date;
  const ms = Date.parse(String(raw ?? ""));
  return Number.isFinite(ms) ? ms : 0;
}

function isPickupCanonical(c: ProviderCanonicalStatus): boolean {
  return c === "PICKED_UP" || c === "IN_TRANSIT" || c === "OUT_FOR_DELIVERY" || c === "DELIVERED";
}

/**
 * Pick the current Durin machine status from history.
 * Prefer the newest event by date (not highest lifecycle rank) so an older
 * `delivered` scan cannot override a later `undelivered_attempted` / RTO.
 * When dates are missing, assume Durin newest-first order (first row wins).
 * Exported for unit tests.
 */
export function pickBestEkartHistoryStatus(historyRows: unknown[]): {
  status: string;
  pickupDate?: string;
} {
  type Ev = {
    machine: string;
    canonical: ProviderCanonicalStatus;
    dateMs: number;
    dateStr: string;
  };
  const events: Ev[] = [];

  for (const row of historyRows) {
    const o = asRecord(row);
    if (!o) continue;
    const machine = String(o.status ?? "").trim();
    if (!machine) continue;
    const canonical = mapEkartStatusToProviderCanonical(machine);
    const dateMs = historyEventDateMs(o);
    const dateStr = String(
      o.event_date_iso8601 ?? o.event_date ?? o.updated_datetime ?? o.date ?? ""
    );
    events.push({ machine, canonical, dateMs, dateStr });
  }

  if (events.length === 0) return { status: "" };

  let pickupDate: string | undefined;
  let pickupMs = Number.POSITIVE_INFINITY;
  for (const e of events) {
    if (!isPickupCanonical(e.canonical) || !e.dateStr) continue;
    const ms = e.dateMs > 0 ? e.dateMs : Number.POSITIVE_INFINITY;
    if (ms <= pickupMs) {
      pickupMs = ms;
      pickupDate = e.dateStr;
    }
  }

  const dated = events.filter((e) => e.dateMs > 0);
  if (dated.length > 0) {
    dated.sort((a, b) => {
      if (b.dateMs !== a.dateMs) return b.dateMs - a.dateMs;
      return (PROVIDER_PROGRESS_RANK[b.canonical] ?? 0) - (PROVIDER_PROGRESS_RANK[a.canonical] ?? 0);
    });
    return { status: dated[0]!.machine, pickupDate };
  }

  // No timestamps — Durin TrackResponseV2 is newest-first.
  return { status: events[0]!.machine, pickupDate };
}

/** Exported for unit tests — Durin history → ShipAmaze activities (newest-first). */
export function mapEkartTrackHistory(raw: unknown): ProviderTrackingActivity[] {
  if (!Array.isArray(raw)) return [];
  const out: ProviderTrackingActivity[] = [];
  for (const row of raw) {
    const o = asRecord(row);
    if (!o) continue;
    const date = String(
      o.event_date_iso8601 ?? o.event_date ?? o.updated_datetime ?? o.date ?? ""
    );
    const activity = String(
      o.public_description ?? o.status ?? o.hub_notes ?? o.activity ?? ""
    );
    const location = String(o.hub_name ?? o.city ?? o.location ?? "");
    if (!activity && !date) continue;
    out.push({ date, activity, location });
  }
  return out;
}

/** Exported for unit tests — pick shipment block from TrackResponseV2. */
export function extractEkartShipmentBlock(raw: unknown, awb: string): Record<string, unknown> {
  const root = asRecord(raw);
  if (!root) return {};

  // Map keyed by tracking id (primary Durin shape)
  if (asRecord(root[awb])) return asRecord(root[awb])!;

  for (const [k, v] of Object.entries(root)) {
    if (k === "request_id" || k === "response") continue;
    const block = asRecord(v);
    if (
      block &&
      (String(block.shipment_id ?? "") === awb ||
        String(block.external_tracking_id ?? "") === awb)
    ) {
      return block;
    }
  }

  const response = Array.isArray(root.response) ? root.response : null;
  if (response) {
    for (const item of response) {
      const block = asRecord(item);
      if (!block) continue;
      const id = String(block.tracking_id ?? block.shipment_id ?? "").trim();
      if (!id || id === awb) return block;
    }
  }

  return root;
}

/**
 * Parse Durin track payload into ProviderTrackingResult fields.
 * Status uses machine codes from history (e.g. `delivered`), not public text.
 * Elite "Seller Cancelled" often sets `rto: true` / `rto_detail` without a cancel history row.
 */
export function parseEkartTrackResponse(
  raw: unknown,
  awb: string
): Omit<ProviderTrackingResult, "raw"> & { rawStatusCode: string } {
  const block = extractEkartShipmentBlock(raw, awb);
  const historyRows = Array.isArray(block.history) ? block.history : [];
  const activities = mapEkartTrackHistory(historyRows);

  const best = pickBestEkartHistoryStatus(historyRows);
  const latest = asRecord(historyRows[0]);
  const machineStatus = best.status || String(latest?.status ?? "").trim();
  const deliveredFlag = block.delivered === true;
  const blockStatus = String(block.status ?? "").trim();
  // Prefer machine codes / block status. Only fall back to public activity text
  // when history has no machine status — never invent shipment_created when
  // activities already show pickup/transit (that trapped orders on Pending Pickup).
  const activityFallback = activities[0]?.activity ? String(activities[0].activity) : "";
  let status =
    machineStatus ||
    (deliveredFlag ? "delivered" : "") ||
    blockStatus ||
    activityFallback ||
    "shipment_created";

  // Elite seller cancel / pre-pickup RTO: Durin keeps history at out_for_pickup but sets rto flags.
  const rtoFlag = block.rto === true;
  const rtoDetail = asRecord(block.rto_detail);
  const rtoApproved = rtoDetail?.approved === true;
  const rtoReason = String(rtoDetail?.reason ?? "").toLowerCase();
  const historyCanonical = mapEkartStatusToProviderCanonical(machineStatus || status);
  const stillPrePickup =
    historyCanonical === "CREATED" ||
    !machineStatus ||
    /^(shipment_created|pickup_scheduled|out_for_pickup|pickup_out_for_pickup|pickup_reattempt|lpd_generated)$/i.test(
      machineStatus
    );
  const cancelReason =
    /cancel/i.test(rtoReason) ||
    /cancel/i.test(String(asRecord(Array.isArray(block.shipment_notes) ? block.shipment_notes[0] : null)?.note ?? ""));
  if ((rtoFlag || rtoApproved) && stillPrePickup && (cancelReason || rtoApproved || rtoFlag)) {
    // Prefer CANCELLED so status sync moves to Reship (seller cancel), not lingering In Transit.
    status = cancelReason || rtoApproved ? "seller_cancelled" : "rto_created";
  } else if ((rtoFlag || rtoApproved) && historyCanonical !== "CANCELLED" && historyCanonical !== "RETURNED") {
    // Post-pickup RTO path — keep return lifecycle.
    if (!/^(return_|rto_)/i.test(machineStatus)) {
      status = "rto_created";
    }
  }

  // Only true Durin delivery — never treat "undelivered*" / attempt text as delivered.
  const statusCanonical = mapEkartStatusToProviderCanonical(status);
  const delivered = statusCanonical === "DELIVERED";

  let pickupDate = best.pickupDate;
  if (!pickupDate) {
    if (isPickupCanonical(statusCanonical)) {
      pickupDate =
        String(activities.find((a) => /pick/i.test(a.activity))?.date || "") || undefined;
    }
  }

  return {
    awb: String(block.external_tracking_id ?? block.shipment_id ?? awb),
    status,
    rawStatusCode: machineStatus || status,
    courierName: String(block.merchant_name ?? "Ekart"),
    providerOrderId: String(block.order_id ?? block.external_tracking_id ?? awb),
    activities,
    deliveredDate: delivered
      ? String(activities[0]?.date || latest?.event_date_iso8601 || latest?.event_date || "")
      : undefined,
    pickupDate: pickupDate || undefined,
    message: undefined,
  };
}

export async function trackEkartShipment(
  input: ProviderTrackInput
): Promise<ProviderTrackingResult> {
  const awb = String(input.awb ?? "").trim();
  if (!awb) {
    throw new AppError(400, "Ekart track requires AWB / tracking id");
  }

  const started = Date.now();
  recordEkartTrackAttempt();

  try {
    const raw = await ekartPost<unknown>(
      ekartConfig.trackEndpoint,
      { tracking_ids: [awb] },
      { retryable: true }
    );

    const parsed = parseEkartTrackResponse(raw, awb);
    recordEkartTrackSuccess(Date.now() - started);

    return {
      awb: parsed.awb,
      status: parsed.status,
      courierName: parsed.courierName,
      providerOrderId: parsed.providerOrderId,
      activities: parsed.activities,
      deliveredDate: parsed.deliveredDate,
      pickupDate: parsed.pickupDate,
      message: parsed.message,
      raw,
    };
  } catch (err) {
    recordEkartTrackFailure(Date.now() - started);
    throw err;
  }
}
