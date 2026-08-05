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
  return resolveCourierProviderId(order.courierProvider);
}

export async function cancelProviderShipmentForOrder(
  order: IOrder,
  opts?: { reason?: string }
): Promise<CancelProviderShipmentResult> {
  const providerId = resolveCancelProviderId(order);
  const awb = String(order.awb ?? "").trim();
  const lorrigoOrderId = String(order.lorrigoOrderId ?? "").trim();
  const velocityOrderId = String(order.velocityOrderId ?? "").trim();

  if (providerId === "lorrigo" && !lorrigoOrderId && !awb) {
    return { attempted: false, success: false, provider: "lorrigo", message: "No Lorrigo shipment to cancel" };
  }
  if (providerId === "ekart" && !awb) {
    return { attempted: false, success: false, provider: "ekart", message: "No AWB to cancel" };
  }
  if (providerId === "velocity" && !awb) {
    return { attempted: false, success: false, provider: "velocity", message: "No AWB to cancel" };
  }

  let provider;
  try {
    provider = getCourierProvider(providerId);
  } catch {
    return {
      attempted: false,
      success: false,
      provider: providerId,
      message: `${providerId} provider is not registered`,
    };
  }

  if (!provider.isConfigured() || !providerSupports(provider.capabilities, "cancel")) {
    return {
      attempted: false,
      success: false,
      provider: providerId,
      message: `${provider.displayName} cancel is not available`,
    };
  }

  const correlationId = ensureCorrelationId(order);
  const reason = String(opts?.reason ?? "customer_request").trim() || "customer_request";

  appendProviderEvent(order, {
    provider: providerId,
    type: "CANCEL_REQUEST",
    status: "PENDING",
    correlationId,
    metadata: {
      awb: awb || undefined,
      providerOrderId: providerId === "lorrigo" ? lorrigoOrderId || undefined : velocityOrderId || undefined,
    },
  });

  try {
    const result = await provider.cancelShipment({
      providerOrderId:
        providerId === "lorrigo"
          ? lorrigoOrderId || undefined
          : providerId === "ekart"
            ? String(order.ekartClientReferenceId ?? "").trim() || undefined
            : velocityOrderId || undefined,
      awbs: awb ? [awb] : undefined,
      reason,
      merchantReferenceId:
        providerId === "ekart"
          ? String(order.ekartClientReferenceId ?? "").trim() || undefined
          : undefined,
      serviceLeg:
        providerId === "ekart" &&
        String(order.ekartTrackingId ?? order.awb ?? "").toUpperCase().charAt(3) === "R"
          ? "REVERSE"
          : providerId === "ekart"
            ? "FORWARD"
            : undefined,
    });
    appendProviderEvent(order, {
      provider: providerId,
      type: "CANCEL_RESPONSE",
      status: result.success ? "SUCCESS" : "FAILED",
      correlationId,
      message: result.message,
    });
    return {
      attempted: true,
      success: Boolean(result.success),
      provider: providerId,
      message: result.message,
    };
  } catch (err) {
    const message = providerPublicMessage(err, "Provider cancel failed");
    appendProviderEvent(order, {
      provider: providerId,
      type: "CANCEL_RESPONSE",
      status: "FAILED",
      correlationId,
      message,
    });
    console.warn(
      `[courier:cancel] ${providerId} cancel failed orderId=${order.orderId} awb=${awb || "-"}: ${message}`
    );
    return { attempted: true, success: false, provider: providerId, message };
  }
}
