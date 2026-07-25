/**
 * Lorrigo CourierProvider adapter.
 * Phase 2: authentication only. Other capabilities throw until later phases.
 */

import type { CourierProvider } from "../../CourierProvider.js";
import type {
  ProviderCancelInput,
  ProviderCreateShipmentInput,
  ProviderPickupInput,
  ProviderRatesInput,
  ProviderServiceabilityInput,
  ProviderTrackInput,
} from "../../types.js";
import { AppError } from "../../../../middleware/errorMiddleware.js";
import {
  ensureLorrigoAuth,
  invalidateLorrigoToken,
} from "../../../lorrigo/lorrigo.client.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag } from "../../../lorrigo/lorrigo.config.js";

function notImplemented(capability: string): never {
  throw new AppError(501, `Lorrigo ${capability} is not implemented yet (Phase 2 is authentication only).`);
}

export const lorrigoCourierProvider: CourierProvider = {
  id: "lorrigo",
  displayName: "Lorrigo",

  isConfigured(): boolean {
    return isLorrigoEnabledFlag() && isLorrigoConfigured();
  },

  async authenticate(): Promise<void> {
    if (!isLorrigoEnabledFlag()) {
      throw new AppError(503, "Lorrigo integration is disabled (LORRIGO_ENABLED is not true).");
    }
    await ensureLorrigoAuth();
  },

  serviceability(_input: ProviderServiceabilityInput) {
    return notImplemented("serviceability");
  },

  getRates(_input: ProviderRatesInput) {
    return notImplemented("getRates");
  },

  createPickup(_input: ProviderPickupInput) {
    return notImplemented("createPickup");
  },

  createShipment(_input: ProviderCreateShipmentInput) {
    return notImplemented("createShipment");
  },

  cancelShipment(_input: ProviderCancelInput) {
    return notImplemented("cancelShipment");
  },

  trackShipment(_input: ProviderTrackInput) {
    return notImplemented("trackShipment");
  },

  syncStatus() {
    return notImplemented("syncStatus");
  },

  syncNDR() {
    return notImplemented("syncNDR");
  },
};

/** Explicit token invalidation for diagnostics / tests. */
export function invalidateLorrigoProviderAuth(): void {
  invalidateLorrigoToken();
}
