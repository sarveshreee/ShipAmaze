/**
 * Recover ghost Ekart shipments — when Durin already has the tracking_id but
 * ShipAmaze lost the AWB (failed booking, local cancel without provider cancel).
 */

import type {
  ProviderCreateShipmentInput,
  ProviderShipmentResult,
} from "../courier/types.js";
import type { IOrder } from "../../models/Order.js";
import { ekartConfig, isEkartConfigured, isEkartEnabledFlag } from "./ekart.config.js";
import {
  buildEkartClientReferenceId,
  buildEkartTrackingId,
  type EkartCreatePayloadBuild,
} from "./ekart.payload.js";
import { isEkartTrackFound, trackEkartShipment } from "./ekart.tracking.js";
import { mapEkartStatusToProviderCanonical } from "../courier/statusNormalize.js";
import { recordEkartBookingSuccess } from "./ekart.metrics.js";

export function resolveEkartPaymentMode(order: { payment?: unknown }): "cod" | "prepaid" {
  return String(order.payment ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid";
}

/** Deterministic Durin tracking_id for an order (same as create payload). */
export function resolveEkartTrackingIdForOrder(order: {
  orderId?: string;
  awb?: string;
  ekartTrackingId?: string;
  payment?: unknown;
  providerEvents?: Array<{ provider?: string; type?: string; message?: string; metadata?: Record<string, unknown> }>;
}): string {
  const direct = String(order.awb ?? order.ekartTrackingId ?? "").trim();
  if (direct) return direct;

  // After fake/local reship, AWB may be cleared — recover from booking event.
  const events = Array.isArray(order.providerEvents) ? order.providerEvents : [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (String(e?.provider ?? "").toLowerCase() !== "ekart") continue;
    const metaAwb = String(e?.metadata?.providerShipmentId ?? e?.metadata?.awb ?? "").trim();
    if (metaAwb) return metaAwb;
    const msg = String(e?.message ?? "");
    const m = msg.match(/\b(TEC[PCR]\d{10})\b/i);
    if (m?.[1]) return m[1].toUpperCase();
  }

  const orderId = String(order.orderId ?? "").trim();
  if (!orderId) return "";
  return buildEkartTrackingId({
    merchantCode: ekartConfig.merchantCode,
    paymentMode: resolveEkartPaymentMode(order),
    orderId,
  });
}

export function resolveEkartMerchantReferenceForOrder(order: {
  orderId?: string;
  ekartClientReferenceId?: string;
}): string {
  const stored = String(order.ekartClientReferenceId ?? "").trim();
  if (stored) return stored;
  return buildEkartClientReferenceId(String(order.orderId ?? ""));
}

export function isEkartDuplicateCreateMessage(message: string): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    m.includes("shipment already present") ||
    m.includes("shipment already exists") ||
    m.includes("already present") ||
    m.includes("duplicate shipment") ||
    m.includes("duplicate tracking")
  );
}

/** Failed Ekart booking with no persisted AWB — ghost shipment may still exist at Durin. */
export function shouldAttemptEkartGhostCancel(order: IOrder): boolean {
  if (!isEkartEnabledFlag() || !isEkartConfigured()) return false;
  const provider = String(order.courierProvider ?? "").trim().toLowerCase();
  if (provider === "velocity" || provider === "lorrigo") return false;
  if (String(order.velocityShipmentId ?? order.velocityOrderId ?? "").trim()) return false;
  if (String(order.lorrigoOrderId ?? order.lorrigoShipmentId ?? "").trim()) return false;
  if (provider === "ekart") return true;
  // booking_failed / reship with no AWB — likely ghost Ekart create from Process Selected
  return !String(order.awb ?? "").trim();
}

export async function recoverEkartDuplicateShipment(
  built: EkartCreatePayloadBuild,
  input: ProviderCreateShipmentInput,
  startedMs = Date.now()
): Promise<ProviderShipmentResult | null> {
  const trackingId = String(built.trackingIdSent ?? "").trim();
  if (!trackingId) return null;

  try {
    const tracked = await trackEkartShipment({ awb: trackingId });
    const awb = String(tracked.awb || trackingId).trim();
    const canonical = mapEkartStatusToProviderCanonical(tracked.status);
    if (isEkartTrackFound(tracked) && (canonical === "CANCELLED" || canonical === "RETURNED")) {
      return null;
    }

    recordEkartBookingSuccess(Date.now() - startedMs);
    return {
      providerOrderId: tracked.providerOrderId || built.clientReferenceId,
      providerShipmentId: awb,
      awb,
      courierId: input.courierId || `ekart:${built.serviceCode}`,
      courierName: input.courierName || `Ekart ${built.serviceCode}`,
      status: tracked.status || "pending_pickup",
      message: "Recovered existing Ekart shipment (duplicate create)",
      raw: {
        shipamaze: {
          recoveredDuplicate: true,
          clientReferenceId: built.clientReferenceId,
          trackingIdSent: trackingId,
        },
        track: tracked.raw,
      },
    };
  } catch {
    // Durin said already present — keep that AWB even if track is briefly empty.
    recordEkartBookingSuccess(Date.now() - startedMs);
    return {
      providerOrderId: built.clientReferenceId,
      providerShipmentId: trackingId,
      awb: trackingId,
      courierId: input.courierId || `ekart:${built.serviceCode}`,
      courierName: input.courierName || `Ekart ${built.serviceCode}`,
      status: "pending_pickup",
      message: "Recovered existing Ekart shipment (duplicate create)",
      raw: {
        shipamaze: {
          recoveredDuplicate: true,
          clientReferenceId: built.clientReferenceId,
          trackingIdSent: trackingId,
        },
      },
    };
  }
}

const FLIPKART_AWB = /\b([A-Z]{3}[PCR]\d{10})\b/i;

/** Last Durin tracking id we already sent for this order (Failed retry must reuse it). */
export function lastEkartAcceptedTrackingId(order: {
  awb?: string;
  ekartTrackingId?: string;
  providerBookingRaw?: unknown;
  providerEvents?: Array<{ provider?: string; type?: string; message?: string; metadata?: Record<string, unknown> }>;
  statusHistory?: Array<{ note?: string }>;
}): string {
  const direct = String(order.awb ?? order.ekartTrackingId ?? "").trim();
  if (FLIPKART_AWB.test(direct)) return direct.toUpperCase();

  const raw = order.providerBookingRaw && typeof order.providerBookingRaw === "object"
    ? (order.providerBookingRaw as Record<string, unknown>)
    : {};
  const ship = raw.shipamaze && typeof raw.shipamaze === "object"
    ? (raw.shipamaze as Record<string, unknown>)
    : {};
  for (const v of [ship.trackingIdSent, ship.trackingIdFromResponse, raw.tracking_id]) {
    const s = String(v ?? "").trim();
    if (FLIPKART_AWB.test(s)) return s.toUpperCase();
  }
  const first =
    Array.isArray(raw.response) && raw.response[0] && typeof raw.response[0] === "object"
      ? (raw.response[0] as Record<string, unknown>)
      : {};
  const fromResp = String(first.tracking_id ?? "").trim();
  if (FLIPKART_AWB.test(fromResp)) return fromResp.toUpperCase();

  const events = Array.isArray(order.providerEvents) ? order.providerEvents : [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (String(e?.provider ?? "").toLowerCase() !== "ekart") continue;
    const meta = String(e?.metadata?.providerShipmentId ?? e?.metadata?.awb ?? "").trim();
    if (FLIPKART_AWB.test(meta)) return meta.toUpperCase();
    const m = String(e?.message ?? "").match(FLIPKART_AWB);
    if (m?.[1]) return m[1].toUpperCase();
  }
  const hist = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  for (let i = hist.length - 1; i >= 0; i -= 1) {
    const m = String(hist[i]?.note ?? "").match(FLIPKART_AWB);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return "";
}
