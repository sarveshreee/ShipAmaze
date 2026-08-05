/**
 * Ekart CourierProvider adapter — no pickup sync; booking maps Pickup → source/return_location.
 */

import type { CourierProvider } from "../../CourierProvider.js";
import type {
  ProviderCancelInput,
  ProviderCancelResult,
  ProviderCourierOption,
  ProviderCreateShipmentInput,
  ProviderFetchNdrInput,
  ProviderGetShipmentInput,
  ProviderNdrActionInput,
  ProviderNdrActionResult,
  ProviderNdrRecord,
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
import { EKART_CAPABILITIES } from "../../capabilities.js";
import { ensureEkartAuth, invalidateEkartToken } from "../../../ekart/ekart.client.js";
import { isEkartConfigured, isEkartEnabledFlag } from "../../../ekart/ekart.config.js";
import {
  cancelEkartShipment,
  createEkartShipment,
  getEkartShipment,
  trackEkartShipmentByAwb,
} from "../../../ekart/ekart.booking.js";
import { fetchEkartServiceableCouriers } from "../../../ekart/ekart.serviceability.js";
import { syncEkartActiveShipmentStatuses } from "../../../ekart/ekart.statusSync.js";

export const ekartCourierProvider: CourierProvider = {
  id: "ekart",
  displayName: "Ekart",
  capabilities: EKART_CAPABILITIES,

  isConfigured(): boolean {
    return isEkartEnabledFlag() && isEkartConfigured();
  },

  async authenticate(): Promise<void> {
    if (!isEkartEnabledFlag()) {
      throw new AppError(503, "Ekart integration is disabled (EKART_ENABLED is not true).");
    }
    await ensureEkartAuth();
  },

  async serviceability(input: ProviderServiceabilityInput): Promise<ProviderCourierOption[]> {
    return fetchEkartServiceableCouriers(input);
  },

  async getRates(_input: ProviderRatesInput): Promise<ProviderCourierOption[]> {
    // Durin has no freight rate API — do not fake rates.
    return [];
  },

  async createPickup(_input: ProviderPickupInput): Promise<ProviderPickupResult> {
    throw new AppError(
      501,
      "Ekart does not support pickup/warehouse creation. ShipAmaze Pickup is mapped at booking time."
    );
  },

  async createShipment(input: ProviderCreateShipmentInput): Promise<ProviderShipmentResult> {
    return createEkartShipment(input);
  },

  async cancelShipment(input: ProviderCancelInput): Promise<ProviderCancelResult> {
    return cancelEkartShipment(input);
  },

  async trackShipment(input: ProviderTrackInput): Promise<ProviderTrackingResult> {
    return trackEkartShipmentByAwb(input);
  },

  async getShipment(input: ProviderGetShipmentInput): Promise<ProviderShipmentResult> {
    return getEkartShipment(input);
  },

  async syncStatus(opts?: { batchSize?: number }): Promise<ProviderSyncResult> {
    const r = await syncEkartActiveShipmentStatuses(opts?.batchSize);
    return {
      scanned: r.processed,
      updated: r.updated,
      errors: r.errors,
      skipped: r.skipped,
      statusChanges: r.statusChanges,
      errorDetails: r.errorDetails,
      message: "ekart status sync",
    };
  },

  supportsNDR(): boolean {
    return false;
  },

  async fetchNDR(_input?: ProviderFetchNdrInput): Promise<ProviderNdrRecord[]> {
    return [];
  },

  async performNDRAction(_input: ProviderNdrActionInput): Promise<ProviderNdrActionResult> {
    throw new AppError(501, "Ekart NDR actions are not supported yet.");
  },

  async syncNDR(_opts?: { daysBack?: number }): Promise<ProviderSyncResult> {
    return { fetched: 0, upserted: 0, errors: 0, message: "ekart ndr not supported" };
  },
};

export function invalidateEkartProviderAuth(): void {
  invalidateEkartToken();
}
