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
import { trackEkartShipment } from "./ekart.tracking.js";
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
}): string {
  const direct = String(order.awb ?? order.ekartTrackingId ?? "").trim();
  if (direct) return direct;
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
    if (!awb) return null;

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
    return null;
  }
}
