/**
 * Cancel a shipment on the order's courier provider (Velocity / Lorrigo).
 * Soft-fails on provider errors so local reship can still proceed.
 */

import type { IOrder } from "../../models/Order.js";
import { providerPublicMessage } from "./http/providerErrors.js";
import { getCourierProvider, resolveCourierProviderId } from "./providerRegistry.js";
import { providerSupports } from "./capabilities.js";
import { appendProviderEvent } from "./providerEvents.js";
import { ensureCorrelationId } from "./correlation.js";
import {
  resolveEkartMerchantReferenceForOrder,
  resolveEkartTrackingIdForOrder,
  shouldAttemptEkartGhostCancel,
} from "../ekart/ekart.recover.js";

export type CancelProviderShipmentResult = {
  attempted: boolean;
  success: boolean;
  provider: "velocity" | "lorrigo" | "ekart";
  message?: string;
};

/** Prefer explicit courierProvider; if missing, infer from stored provider ids. */
function resolveCancelProviderId(order: IOrder): "velocity" | "lorrigo" | "ekart" {
  const explicit = String(order.courierProvider ?? "").trim().toLowerCase();
  if (explicit === "lorrigo") return "lorrigo";
  if (explicit === "ekart") return "ekart";
  if (explicit === "velocity") return "velocity";
  if (String(order.lorrigoOrderId ?? "").trim() || String(order.lorrigoShipmentId ?? "").trim()) {
    return "lorrigo";
  }
  if (String(order.ekartTrackingId ?? "").trim() || String(order.ekartRequestId ?? "").trim()) {
    return "ekart";
  }
  const recovered = resolveEkartTrackingIdForOrder(order);
  if (/^[A-Z]{3}[PCR]\d{10}$/i.test(recovered)) return "ekart";
  const events = Array.isArray(order.providerEvents) ? order.providerEvents : [];
  if (events.some((e) => String(e.provider ?? "").toLowerCase() === "ekart")) return "ekart";
  return resolveCourierProviderId(order.courierProvider);
}

export async function cancelProviderShipmentForOrder(
  order: IOrder,
  opts?: { reason?: string }
): Promise<CancelProviderShipmentResult> {
  const providerId = resolveCancelProviderId(order);
  let awb = String(order.awb ?? "").trim();
  const lorrigoOrderId = String(order.lorrigoOrderId ?? "").trim();
  const velocityOrderId = String(order.velocityOrderId ?? "").trim();

  const ekartGhostCancel =
    providerId === "ekart" || (shouldAttemptEkartGhostCancel(order) && !lorrigoOrderId && !velocityOrderId);
  if (ekartGhostCancel && !awb) {
    awb = resolveEkartTrackingIdForOrder(order);
  }

  if (providerId === "lorrigo" && !lorrigoOrderId && !awb && !ekartGhostCancel) {
    return { attempted: false, success: false, provider: "lorrigo", message: "No Lorrigo shipment to cancel" };
  }
  if (ekartGhostCancel && !awb) {
    return { attempted: false, success: false, provider: "ekart", message: "No Ekart AWB to cancel" };
  }
  if (providerId === "velocity" && !awb && !ekartGhostCancel) {
    return { attempted: false, success: false, provider: "velocity", message: "No AWB to cancel" };
  }

  const cancelProvider: "velocity" | "lorrigo" | "ekart" = ekartGhostCancel ? "ekart" : providerId;

  let provider;
  try {
    provider = getCourierProvider(cancelProvider);
  } catch {
    return {
      attempted: false,
      success: false,
      provider: cancelProvider,
      message: `${cancelProvider} provider is not registered`,
    };
  }

  if (!provider.isConfigured() || !providerSupports(provider.capabilities, "cancel")) {
    return {
      attempted: false,
      success: false,
      provider: cancelProvider,
      message: `${provider.displayName} cancel is not available`,
    };
  }

  const correlationId = ensureCorrelationId(order);
  const reason = String(opts?.reason ?? "customer_request").trim() || "customer_request";
  const ekartMerchantRef = resolveEkartMerchantReferenceForOrder(order);

  appendProviderEvent(order, {
    provider: cancelProvider,
    type: "CANCEL_REQUEST",
    status: "PENDING",
    correlationId,
    metadata: {
      awb: awb || undefined,
      providerOrderId:
        cancelProvider === "lorrigo"
          ? lorrigoOrderId || undefined
          : cancelProvider === "ekart"
            ? ekartMerchantRef || undefined
            : velocityOrderId || undefined,
    },
  });

  try {
    const result = await provider.cancelShipment({
      providerOrderId:
        cancelProvider === "lorrigo"
          ? lorrigoOrderId || undefined
          : cancelProvider === "ekart"
            ? ekartMerchantRef || undefined
            : velocityOrderId || undefined,
      awbs: awb ? [awb] : undefined,
      reason,
      merchantReferenceId: cancelProvider === "ekart" ? ekartMerchantRef || undefined : undefined,
      serviceLeg:
        cancelProvider === "ekart" &&
        String(order.ekartTrackingId ?? awb ?? "").toUpperCase().charAt(3) === "R"
          ? "REVERSE"
          : cancelProvider === "ekart"
            ? "FORWARD"
            : undefined,
    });
    appendProviderEvent(order, {
      provider: cancelProvider,
      type: "CANCEL_RESPONSE",
      status: result.success ? "SUCCESS" : "FAILED",
      correlationId,
      message: result.message,
    });
    return {
      attempted: true,
      success: Boolean(result.success),
      provider: cancelProvider,
      message: result.message,
    };
  } catch (err) {
    const message = providerPublicMessage(err, "Provider cancel failed");
    appendProviderEvent(order, {
      provider: cancelProvider,
      type: "CANCEL_RESPONSE",
      status: "FAILED",
      correlationId,
      message,
    });
    console.warn(
      `[courier:cancel] ${cancelProvider} cancel failed orderId=${order.orderId} awb=${awb || "-"}: ${message}`
    );
    return { attempted: true, success: false, provider: cancelProvider, message };
  }
}
