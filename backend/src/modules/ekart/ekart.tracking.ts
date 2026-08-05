/**
 * Ekart tracking — POST /v2/shipments/track → ProviderTrackingResult.
 */

import type {
  ProviderTrackInput,
  ProviderTrackingActivity,
  ProviderTrackingResult,
} from "../courier/types.js";
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

function mapHistory(raw: unknown): ProviderTrackingActivity[] {
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

function extractShipmentBlock(raw: unknown, awb: string): Record<string, unknown> {
  const root = asRecord(raw);
  if (!root) return {};

  // Map keyed by tracking id
  if (asRecord(root[awb])) return asRecord(root[awb])!;

  for (const [k, v] of Object.entries(root)) {
    if (k === "request_id" || k === "response") continue;
    const block = asRecord(v);
    if (block && (String(block.shipment_id ?? "") === awb || String(block.external_tracking_id ?? "") === awb)) {
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

export async function trackEkartShipment(
  input: ProviderTrackInput
): Promise<ProviderTrackingResult> {
  const awb = String(input.awb ?? "").trim();
  const started = Date.now();
  recordEkartTrackAttempt();

  try {
    const raw = await ekartPost<unknown>(
      ekartConfig.trackEndpoint,
      { tracking_ids: [awb] },
      { retryable: true }
    );

    const block = extractShipmentBlock(raw, awb);
    const history = mapHistory(block.history);
    const status = String(
      history[0]?.activity ||
        block.status ||
        (block.delivered === true ? "delivered" : "in_transit")
    );
    const delivered =
      block.delivered === true ||
      status.toLowerCase().includes("delivered");

    recordEkartTrackSuccess(Date.now() - started);

    return {
      awb: String(block.shipment_id ?? block.external_tracking_id ?? awb),
      status,
      courierName: String(block.merchant_name ?? "Ekart"),
      providerOrderId: String(block.order_id ?? block.external_tracking_id ?? awb),
      activities: history,
      deliveredDate: delivered
        ? String(history[0]?.date || block.event_date || "")
        : undefined,
      pickupDate: undefined,
      message: undefined,
      raw,
    };
  } catch (err) {
    recordEkartTrackFailure(Date.now() - started);
    throw err;
  }
}
