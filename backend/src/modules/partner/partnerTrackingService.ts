import { AppError } from "../../middleware/errorMiddleware.js";
import type { IOrder } from "../../models/Order.js";
import { getCourierProvider, resolveCourierProviderId } from "../courier/providerRegistry.js";
import { getStaticProviderCapabilities, providerSupports } from "../courier/capabilities.js";
import { ensureCorrelationId } from "../courier/correlation.js";

export type PartnerTrackingResult = {
  shipmentId: string;
  referenceId: string;
  awb?: string;
  provider: string;
  status: string;
  activities: Array<{ date: string; activity: string; location: string }>;
};

export async function trackPartnerShipment(order: IOrder): Promise<PartnerTrackingResult> {
  const providerId = resolveCourierProviderId(order.courierProvider);
  const provider = getCourierProvider(providerId);
  const caps = getStaticProviderCapabilities(providerId);

  if (!providerSupports(caps, "tracking")) {
    throw new AppError(501, `${provider.displayName} tracking is not available`);
  }

  const awb = String(order.awb ?? "").trim();
  if (!awb) {
    throw new AppError(400, "Shipment has no AWB yet");
  }

  ensureCorrelationId(order);

  const tracked = await provider.trackShipment({ awb });

  const activities =
    tracked.activities?.map((a) => ({
      date: String(a.date ?? ""),
      activity: String(a.activity ?? ""),
      location: String(a.location ?? ""),
    })) ??
    (order.trackingActivities ?? []).map((a) => ({
      date: a.date,
      activity: a.activity,
      location: a.location,
    }));

  const status = String(tracked.status ?? order.shipmentStatus ?? order.status ?? "unknown").toUpperCase();

  return {
    shipmentId: order.orderId,
    referenceId: String(order.partnerReferenceId ?? ""),
    awb: tracked.awb ?? awb,
    provider: providerId,
    status,
    activities,
  };
}

export async function getPartnerShipmentDetails(order: IOrder): Promise<PartnerTrackingResult> {
  const status = String(order.shipmentStatus ?? order.status ?? "pending").toUpperCase();
  return {
    shipmentId: order.orderId,
    referenceId: String(order.partnerReferenceId ?? ""),
    awb: order.awb ? String(order.awb) : undefined,
    provider: String(order.courierProvider ?? ""),
    status,
    activities: (order.trackingActivities ?? []).map((a) => ({
      date: a.date,
      activity: a.activity,
      location: a.location,
    })),
  };
}
