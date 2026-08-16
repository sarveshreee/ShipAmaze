import { AppError } from "../../middleware/errorMiddleware.js";
import type { IOrder } from "../../models/Order.js";
import { cancelProviderShipmentForOrder } from "../courier/cancelProviderShipment.js";
import { getCourierProvider, resolveCourierProviderId } from "../courier/providerRegistry.js";
import { getStaticProviderCapabilities, providerSupports } from "../courier/capabilities.js";

export type PartnerCancelResult = {
  shipmentId: string;
  referenceId: string;
  status: string;
  cancelled: boolean;
  message?: string;
};

export async function cancelPartnerShipment(order: IOrder): Promise<PartnerCancelResult> {
  const providerId = resolveCourierProviderId(order.courierProvider);
  const provider = getCourierProvider(providerId);
  const caps = getStaticProviderCapabilities(providerId);

  if (!providerSupports(caps, "cancel")) {
    throw new AppError(501, `${provider.displayName} cancellation is not available`);
  }

  const awb = String(order.awb ?? "").trim();
  if (!awb && !order.shipmentCreated) {
    throw new AppError(400, "Shipment is not booked yet");
  }

  const result = await cancelProviderShipmentForOrder(order, { reason: "partner_api_cancel" });

  if (!result.attempted || !result.success) {
    throw new AppError(
      400,
      result.message ?? "Shipment could not be cancelled at the courier"
    );
  }

  order.shipmentCreated = false;
  order.awb = "";
  order.trackingId = undefined;
  order.shipmentId = undefined;
  order.bookingInProgress = false;
  order.status = "reship";
  order.shipmentStatus = "reship";
  await order.save();

  return {
    shipmentId: order.orderId,
    referenceId: String(order.partnerReferenceId ?? ""),
    status: "CANCELLED",
    cancelled: true,
    message: result.message,
  };
}
