/**
 * Ekart tracking — POST /v2/shipments/track → ProviderTrackingResult.
 *
 * Durin TrackResponseV2 is keyed by tracking id; `history` is newest-first.
 * Prefer machine `history[0].status` for canonical mapping; keep
 * `public_description` on timeline activities for UI.
 */

import type {
  ProviderTrackInput,
  ProviderTrackingActivity,
  ProviderTrackingResult,
} from "../courier/types.js";
import { AppError } from "../../middleware/errorMiddleware.js";
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
 */
export function parseEkartTrackResponse(
  raw: unknown,
  awb: string
): Omit<ProviderTrackingResult, "raw"> & { rawStatusCode: string } {
  const block = extractEkartShipmentBlock(raw, awb);
  const historyRows = Array.isArray(block.history) ? block.history : [];
  const activities = mapEkartTrackHistory(historyRows);

  const latest = asRecord(historyRows[0]);
  const machineStatus = String(latest?.status ?? "").trim();
  const deliveredFlag = block.delivered === true;
  const status =
    machineStatus ||
    (deliveredFlag ? "delivered" : "") ||
    String(block.status ?? "").trim() ||
    (activities[0]?.activity ? String(activities[0].activity) : "") ||
    "shipment_created";

  const delivered =
    deliveredFlag ||
    machineStatus.toLowerCase() === "delivered" ||
    status.toLowerCase().includes("delivered");

  return {
    awb: String(block.shipment_id ?? block.external_tracking_id ?? awb),
    status,
    rawStatusCode: machineStatus || status,
    courierName: String(block.merchant_name ?? "Ekart"),
    providerOrderId: String(block.order_id ?? block.external_tracking_id ?? awb),
    activities,
    deliveredDate: delivered
      ? String(activities[0]?.date || latest?.event_date_iso8601 || latest?.event_date || "")
      : undefined,
    pickupDate: undefined,
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
