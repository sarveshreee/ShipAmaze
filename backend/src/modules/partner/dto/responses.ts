import type { ProviderCourierOption } from "../../courier/types.js";
import type { IOrder } from "../../../models/Order.js";

export type PartnerCourierOptionDto = {
  provider: string;
  courierId: string;
  courierName: string;
  serviceable: boolean;
  estimatedDays?: number;
  freight?: number;
  codSupported?: boolean;
  codCharge?: number;
  rtoCharge?: number;
  totalCharge?: number;
};

export function mapCourierOptionToDto(option: ProviderCourierOption): PartnerCourierOptionDto {
  return {
    provider: option.provider,
    courierId: option.courierId,
    courierName: option.courierName,
    serviceable: option.serviceable,
    estimatedDays: option.estimatedDays,
    freight: option.freight ?? option.freightCharge,
    codSupported: option.codSupported ?? option.cod,
    codCharge: option.codCharge,
    rtoCharge: option.rtoCharge,
    totalCharge: option.totalCharge,
  };
}

export type PartnerShipmentDto = {
  shipmentId: string;
  referenceId: string;
  awb?: string;
  provider?: string;
  status: string;
  courierName?: string;
  labelUrl?: string;
  shippingCharges?: number;
  activities?: Array<{ date: string; activity: string; location: string }>;
  bookedAt?: string;
  createdAt?: string;
};

export function mapOrderToPartnerShipmentDto(order: IOrder): PartnerShipmentDto {
  const status = String(order.shipmentStatus ?? order.status ?? "pending").toUpperCase();
  return {
    shipmentId: order.orderId,
    referenceId: String(order.partnerReferenceId ?? ""),
    awb: order.awb ? String(order.awb) : undefined,
    provider: order.courierProvider,
    status,
    courierName: order.courierName,
    labelUrl: order.labelUrl,
    shippingCharges: order.shippingCharges,
    activities: (order.trackingActivities ?? []).map((a) => ({
      date: a.date,
      activity: a.activity,
      location: a.location,
    })),
    bookedAt: order.bookedAt?.toISOString(),
    createdAt: (order as { createdAt?: Date }).createdAt?.toISOString?.() ?? undefined,
  };
}

export function partnerSuccessResponse(
  data: unknown,
  requestId: string,
  correlationId: string
): Record<string, unknown> {
  return {
    success: true,
    data,
    requestId,
    correlationId,
  };
}

export function partnerErrorResponse(
  code: string,
  message: string,
  retryable: boolean,
  requestId: string,
  correlationId: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    success: false,
    error: {
      code,
      message,
      retryable,
      ...extra,
    },
    requestId,
    correlationId,
  };
}
