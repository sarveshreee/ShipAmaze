/**
 * Velocity adapter — implements CourierProvider by delegating to existing Velocity modules.
 * Behavior must match pre-refactor Velocity APIs.
 */

import type { CourierProvider } from "../../CourierProvider.js";
import type {
  ProviderCancelInput,
  ProviderCancelResult,
  ProviderCourierOption,
  ProviderCreateShipmentInput,
  ProviderPickupInput,
  ProviderPickupResult,
  ProviderRatesInput,
  ProviderServiceabilityInput,
  ProviderShipmentResult,
  ProviderSyncResult,
  ProviderTrackInput,
  ProviderTrackingResult,
} from "../../types.js";
import { AppError } from "../../../../middleware/errorMiddleware.js";
import { isVelocityConfigured } from "../../../../config/env.js";
import { velocityConfig } from "../../../velocity/velocity.config.js";
import { ensureVelocityAuth } from "../../../velocity/velocity.client.js";
import * as velocityService from "../../../velocity/velocity.service.js";
import { syncActiveShipmentStatuses } from "../../../velocity/velocity.statusSync.js";
import { syncNdrFromVelocity } from "../../../velocity/velocity.ndrSync.js";
import type { VelocityForwardOrderRequest } from "../../../velocity/velocity.types.js";

import { finalizeCourierOption, parseEstimatedDays } from "../../normalizeCourierOption.js";

function mapServiceability(
  rows: Awaited<ReturnType<typeof velocityService.checkServiceability>>["data"]
): ProviderCourierOption[] {
  const out: ProviderCourierOption[] = [];
  for (const c of rows ?? []) {
    const finalized = finalizeCourierOption({
      courierId: String(c.carrier_id),
      courierName: c.carrier_name,
      provider: "velocity",
      serviceable: true,
      zone: c.zone,
      cod: c.cod,
      codSupported: c.cod,
      tat: c.tat,
      estimatedDays: parseEstimatedDays(c.tat),
      minWeight: c.min_weight,
      pickupAvailable: true,
      metadata: { source: "velocity", kind: "serviceability" },
    });
    if (finalized) out.push(finalized);
  }
  return out;
}

function mapRates(
  rows: Awaited<ReturnType<typeof velocityService.getRates>>["data"]
): ProviderCourierOption[] {
  const out: ProviderCourierOption[] = [];
  for (const r of rows ?? []) {
    const finalized = finalizeCourierOption({
      courierId: String(r.carrier_id),
      courierName: r.carrier_name,
      provider: "velocity",
      serviceable: true,
      zone: r.zone,
      tat: r.tat,
      estimatedDays: parseEstimatedDays(r.tat),
      freight: r.freight_charge,
      freightCharge: r.freight_charge,
      codCharge: r.cod_charge,
      rtoCharge: r.rto_charge,
      totalCharge: r.total_charge,
      pickupAvailable: true,
      metadata: { source: "velocity", kind: "rates" },
    });
    if (finalized) out.push(finalized);
  }
  return out;
}

export const velocityCourierProvider: CourierProvider = {
  id: "velocity",
  displayName: "Velocity",

  isConfigured(): boolean {
    return isVelocityConfigured();
  },

  async authenticate(): Promise<void> {
    if (!this.isConfigured()) {
      throw new AppError(503, "Velocity integration is not configured (missing credentials).");
    }
    await ensureVelocityAuth();
  },

  async serviceability(input: ProviderServiceabilityInput): Promise<ProviderCourierOption[]> {
    const res = await velocityService.checkServiceability({
      from: input.fromPincode,
      to: input.toPincode,
      payment_mode: input.paymentMode,
      shipment_type: input.shipmentType ?? "forward",
    });
    return mapServiceability(res.data);
  },

  async getRates(input: ProviderRatesInput): Promise<ProviderCourierOption[]> {
    const res = await velocityService.getRates({
      from: input.fromPincode,
      to: input.toPincode,
      weight: input.weightKg,
      length: input.lengthCm,
      width: input.widthCm,
      height: input.heightCm,
      payment_mode: input.paymentMode,
      cod_value: input.codValue,
      shipment_type: input.shipmentType,
      qc_applicable: input.qcApplicable,
    });
    return mapRates(res.data);
  },

  async createPickup(input: ProviderPickupInput): Promise<ProviderPickupResult> {
    const prepared = {
      name: input.name,
      phone_number: input.phone,
      email: input.email ?? "",
      contact_person: input.contactPerson,
      street_address: input.address,
      zip: input.pincode,
      city: input.city,
      state: input.state,
      country: input.country ?? "India",
      gst_no: input.gstNo,
    };

    const result = input.existingPickupId
      ? await velocityService.updateWarehouseInVelocity(input.existingPickupId, prepared)
      : await velocityService.createWarehouseInVelocity(prepared);

    return {
      pickupId: String(result.warehouse_id ?? ""),
      name: result.name,
      message: result.message,
      raw: result,
    };
  },

  async createShipment(input: ProviderCreateShipmentInput): Promise<ProviderShipmentResult> {
    const fromPayload = input.providerPayload as Partial<VelocityForwardOrderRequest> | undefined;

    const velocityPayload: VelocityForwardOrderRequest = {
      warehouse_id: fromPayload?.warehouse_id ?? input.pickupId,
      order_id: fromPayload?.order_id ?? input.orderId,
      payment_mode: fromPayload?.payment_mode ?? input.paymentMode,
      cod_amount: fromPayload?.cod_amount ?? input.codAmount,
      order_amount: fromPayload?.order_amount ?? input.orderAmount,
      weight: fromPayload?.weight ?? input.weightKg,
      length: fromPayload?.length ?? input.lengthCm,
      width: fromPayload?.width ?? input.widthCm,
      height: fromPayload?.height ?? input.heightCm,
      customer: fromPayload?.customer ?? {
        name: input.customer.name,
        phone: input.customer.phone,
        email: input.customer.email,
        address: input.customer.address,
        city: input.customer.city,
        state: input.customer.state,
        pincode: input.customer.pincode,
        country: input.customer.country,
      },
      items:
        fromPayload?.items ??
        input.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          price: i.price,
          sku: i.sku,
          discount: i.discount,
          tax: i.tax,
        })),
      carrier_id: fromPayload?.carrier_id ?? input.courierId,
    };

    const created = await velocityService.createForwardShipment(velocityPayload);
    return {
      providerOrderId: created.order_id,
      providerShipmentId: created.shipment_id,
      awb: created.awb_code,
      courierId: created.carrier_id != null ? String(created.carrier_id) : undefined,
      courierName: created.carrier_name,
      labelUrl: created.label_url,
      manifestUrl: created.manifest_url,
      freightCharge: created.shipping_charges,
      codCharge: created.cod_charges,
      rtoCharge: created.rto_charges,
      status: created.status,
      message: created.message,
      raw: created,
    };
  },

  async cancelShipment(input: ProviderCancelInput): Promise<ProviderCancelResult> {
    const awbs = input.awbs?.filter(Boolean) ?? [];
    if (!awbs.length) {
      throw new AppError(400, "Velocity cancel requires at least one AWB");
    }
    const res = await velocityService.cancelShipment({ awbs });
    return {
      success: true,
      message: typeof (res as { message?: string }).message === "string"
        ? (res as { message?: string }).message
        : undefined,
      raw: res,
    };
  },

  async trackShipment(input: ProviderTrackInput): Promise<ProviderTrackingResult> {
    const res = await velocityService.trackShipment({ awb: input.awb });
    return {
      awb: res.awb,
      status: res.status,
      courierName: res.carrier_name,
      providerOrderId: res.order_id,
      activities: (res.shipment_track_activities ?? []).map((a) => ({
        date: a.date,
        activity: a.activity,
        location: a.location,
      })),
      pickupDate: res.pickup_date,
      deliveredDate: res.delivered_date,
      message: res.message,
      raw: res,
    };
  },

  async syncStatus(opts?: { batchSize?: number }): Promise<ProviderSyncResult> {
    const r = await syncActiveShipmentStatuses(opts?.batchSize);
    return { ...r };
  },

  async syncNDR(opts?: { daysBack?: number }): Promise<ProviderSyncResult> {
    const r = await syncNdrFromVelocity({ daysBack: opts?.daysBack });
    return { ...r };
  },
};

/** Expose config debug flag for callers that need Velocity-specific env without importing config. */
export function isVelocityDebugLogsEnabled(): boolean {
  return velocityConfig.debugLogs;
}
