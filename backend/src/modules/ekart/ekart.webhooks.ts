/**
 * Ekart Critical Updates webhook ingest.
 *
 * Durin docs: client shares an HTTPS endpoint; Ekart POSTs lifecycle events
 * (vendor_tracking_id / merchant_reference_id / status / event).
 * Polling remains the operational source of truth — webhooks are optional acceleration.
 */

import { Order, type IOrder } from "../../models/Order.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { appendProviderEvent } from "../courier/providerEvents.js";
import { ensureCorrelationId } from "../courier/correlation.js";
import {
  mapEkartStatusToProviderCanonical,
  providerCanonicalToOrderStatus,
  shouldApplyStatusUpdate,
} from "../courier/statusNormalize.js";
import { ekartConfig, isEkartEnabledFlag } from "./ekart.config.js";

export type EkartWebhookApplyResult = {
  accepted: boolean;
  matched: boolean;
  statusChanged: boolean;
  orderId?: string;
  message?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function appendStatusHistory(order: IOrder, status: string, note: string) {
  const prev = order.statusHistory ?? [];
  order.statusHistory = [...prev, { status, at: new Date(), note }].slice(-50);
  if (typeof order.markModified === "function") order.markModified("statusHistory");
}

/** Normalize a single Critical Updates push body. */
export function parseEkartCriticalUpdate(body: unknown): {
  awb: string;
  merchantReferenceId: string;
  status: string;
  event: string;
  eventDate?: string;
  location?: string;
  remarks?: string;
} {
  const o = asRecord(body) ?? {};
  return {
    awb: String(o.vendor_tracking_id ?? o.tracking_id ?? "").trim(),
    merchantReferenceId: String(o.merchant_reference_id ?? "").trim(),
    status: String(o.status ?? o.event ?? "").trim(),
    event: String(o.event ?? o.status ?? "").trim(),
    eventDate: o.event_date != null ? String(o.event_date) : undefined,
    location: o.location != null ? String(o.location) : undefined,
    remarks: o.remarks != null ? String(o.remarks) : undefined,
  };
}

export function verifyEkartWebhookSecret(headers: Record<string, unknown>): boolean {
  const expected = ekartConfig.webhookSecret;
  if (!expected) return true; // no secret configured → accept (enrollment uses HTTPS URL alone)
  const auth = String(headers.authorization ?? headers.Authorization ?? "").trim();
  const custom = String(
    headers["x-ekart-webhook-secret"] ?? headers["X-Ekart-Webhook-Secret"] ?? ""
  ).trim();
  if (custom && custom === expected) return true;
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === expected) return true;
  if (auth === expected) return true;
  return false;
}

/**
 * Apply one Critical Updates event to a matching Ekart order (by AWB / merchant ref).
 * Same-status: no duplicate timeline (mirrors poller).
 */
export async function applyEkartCriticalUpdate(
  body: unknown
): Promise<EkartWebhookApplyResult> {
  if (!isEkartEnabledFlag()) {
    return { accepted: false, matched: false, statusChanged: false, message: "Ekart disabled" };
  }
  if (!ekartConfig.webhooksEnabled) {
    return {
      accepted: false,
      matched: false,
      statusChanged: false,
      message: "EKART_WEBHOOKS_ENABLED is false",
    };
  }

  const parsed = parseEkartCriticalUpdate(body);
  if (!parsed.awb && !parsed.merchantReferenceId) {
    return {
      accepted: false,
      matched: false,
      statusChanged: false,
      message: "Missing vendor_tracking_id / merchant_reference_id",
    };
  }

  const or: Array<Record<string, unknown>> = [];
  if (parsed.awb) {
    or.push({ awb: parsed.awb }, { ekartTrackingId: parsed.awb });
  }
  if (parsed.merchantReferenceId) {
    or.push({ ekartClientReferenceId: parsed.merchantReferenceId });
  }

  const order = await Order.findOne({
    courierProvider: "ekart",
    shipmentCreated: true,
    $or: or,
  });

  if (!order) {
    return {
      accepted: true,
      matched: false,
      statusChanged: false,
      message: "No matching Ekart order",
    };
  }

  const correlationId = ensureCorrelationId(order);
  const rawStatus = parsed.status || parsed.event;
  if (!rawStatus) {
    order.lastProviderStatusSyncedAt = new Date();
    await order.save();
    return {
      accepted: true,
      matched: true,
      statusChanged: false,
      orderId: order.orderId,
      message: "Empty status",
    };
  }

  const providerCanonical = mapEkartStatusToProviderCanonical(rawStatus);
  const nextStatus = providerCanonicalToOrderStatus(providerCanonical);
  const current = normalizeOrderStatus(order.status);

  const activity = {
    date: parsed.eventDate || new Date().toISOString(),
    activity: parsed.remarks || parsed.event || rawStatus,
    location: parsed.location || "",
  };
  const prevActs = Array.isArray(order.trackingActivities) ? order.trackingActivities : [];
  order.trackingActivities = [activity, ...prevActs].slice(0, 50);

  if (order.shipmentStatus !== rawStatus) {
    order.shipmentStatus = rawStatus;
  }

  let statusChanged = false;
  if (current !== nextStatus && shouldApplyStatusUpdate(order.status, nextStatus)) {
    appendStatusHistory(order, nextStatus, "ekart_webhook");
    order.status = nextStatus;
    statusChanged = true;
    appendProviderEvent(order, {
      provider: "ekart",
      type: "STATUS_CHANGE",
      status: "SUCCESS",
      correlationId,
      message: `${current} → ${nextStatus}`,
      metadata: {
        source: "webhook",
        providerCanonical,
        rawStatus,
        event: parsed.event,
      },
    });
  } else {
    appendProviderEvent(order, {
      provider: "ekart",
      type: "WEBHOOK_RECEIVED",
      status: "SUCCESS",
      correlationId,
      message: rawStatus,
      metadata: { source: "webhook", event: parsed.event, duplicate: true },
    });
  }

  order.lastProviderStatusSyncedAt = new Date();
  await order.save();

  return {
    accepted: true,
    matched: true,
    statusChanged,
    orderId: order.orderId,
  };
}
