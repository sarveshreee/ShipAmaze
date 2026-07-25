/**
 * Lorrigo CourierProvider adapter.
 * Phase 2: authentication
 * Phase 3: createPickup
 * Phase 4: serviceability / getRates
 * Phase 5: createShipment / cancelShipment / getShipment / trackShipment
 */

import type { CourierProvider } from "../../CourierProvider.js";
import type {
  ProviderCancelInput,
  ProviderCancelResult,
  ProviderCourierOption,
  ProviderCreateShipmentInput,
  ProviderGetShipmentInput,
  ProviderPickupInput,
  ProviderPickupResult,
  ProviderRatesInput,
  ProviderServiceabilityInput,
  ProviderShipmentResult,
  ProviderTrackInput,
  ProviderTrackingResult,
} from "../../types.js";
import { AppError } from "../../../../middleware/errorMiddleware.js";
import {
  ensureLorrigoAuth,
  invalidateLorrigoToken,
  lorrigoPost,
} from "../../../lorrigo/lorrigo.client.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag } from "../../../lorrigo/lorrigo.config.js";
import { fetchLorrigoServiceableCouriers } from "../../../lorrigo/lorrigo.serviceability.js";
import {
  cancelLorrigoShipment,
  createLorrigoShipment,
  getLorrigoShipment,
  trackLorrigoShipment,
} from "../../../lorrigo/lorrigo.booking.js";
import { LORRIGO_CAPABILITIES } from "../../capabilities.js";

function notImplemented(capability: string): never {
  throw new AppError(501, `Lorrigo ${capability} is not implemented yet.`);
}

function extractPickupId(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  for (const c of [
    o.id,
    o._id,
    o.pickupAddressId,
    (o.data as Record<string, unknown> | undefined)?.id,
    (o.data as Record<string, unknown> | undefined)?._id,
  ]) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

export const lorrigoCourierProvider: CourierProvider = {
  id: "lorrigo",
  displayName: "Lorrigo",
  capabilities: LORRIGO_CAPABILITIES,

  isConfigured(): boolean {
    return isLorrigoEnabledFlag() && isLorrigoConfigured();
  },

  async authenticate(): Promise<void> {
    if (!isLorrigoEnabledFlag()) {
      throw new AppError(503, "Lorrigo integration is disabled (LORRIGO_ENABLED is not true).");
    }
    await ensureLorrigoAuth();
  },

  async serviceability(input: ProviderServiceabilityInput): Promise<ProviderCourierOption[]> {
    return fetchLorrigoServiceableCouriers(input);
  },

  async getRates(input: ProviderRatesInput): Promise<ProviderCourierOption[]> {
    return fetchLorrigoServiceableCouriers({
      fromPincode: input.fromPincode,
      toPincode: input.toPincode,
      paymentMode: input.paymentMode,
      shipmentType: input.shipmentType,
      weightKg: input.weightKg,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
      collectableAmount: input.codValue,
    });
  },

  async createPickup(input: ProviderPickupInput): Promise<ProviderPickupResult> {
    if (input.existingPickupId?.trim()) {
      return { pickupId: input.existingPickupId.trim(), message: "Using existing Lorrigo pickup id" };
    }

    const raw = await lorrigoPost<unknown>("/v2/pickup-address", {
      facilityName: input.name,
      contactPersonName: input.contactPerson,
      email: input.email ?? "",
      pincode: input.pincode,
      address: input.address,
      address2: input.address2 ?? "",
      phone: input.phone,
      city: input.city,
      state: input.state,
      country: input.country ?? "India",
    });

    const pickupId = extractPickupId(raw);
    if (!pickupId) {
      throw new AppError(502, "Lorrigo pickup create succeeded but no pickup id was returned");
    }
    return { pickupId, raw };
  },

  async createShipment(input: ProviderCreateShipmentInput): Promise<ProviderShipmentResult> {
    return createLorrigoShipment(input);
  },

  async cancelShipment(input: ProviderCancelInput): Promise<ProviderCancelResult> {
    return cancelLorrigoShipment(input);
  },

  async trackShipment(input: ProviderTrackInput): Promise<ProviderTrackingResult> {
    return trackLorrigoShipment(input);
  },

  async getShipment(input: ProviderGetShipmentInput): Promise<ProviderShipmentResult> {
    return getLorrigoShipment(input);
  },

  syncStatus() {
    return notImplemented("syncStatus");
  },

  syncNDR() {
    return notImplemented("syncNDR");
  },
};

export function invalidateLorrigoProviderAuth(): void {
  invalidateLorrigoToken();
}
