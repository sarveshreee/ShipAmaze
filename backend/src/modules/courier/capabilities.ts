/**
 * Provider capability registry — UI/backend check capabilities instead of provider === "…" branches.
 */

import type { CourierProviderId } from "./types.js";

export interface CourierProviderCapabilities {
  authentication: boolean;
  serviceability: boolean;
  rates: boolean;
  booking: boolean;
  tracking: boolean;
  cancel: boolean;
  ndr: boolean;
  returns: boolean;
  pickupSync: boolean;
  labels: boolean;
  webhooks: boolean;
}

export const VELOCITY_CAPABILITIES: CourierProviderCapabilities = {
  authentication: true,
  serviceability: true,
  rates: true,
  booking: true,
  tracking: true,
  cancel: true,
  ndr: true,
  returns: true,
  pickupSync: true,
  labels: true,
  webhooks: false,
};

/** Phase 5 enables booking + cancel; tracking/labels depend on provider response. */
export const LORRIGO_CAPABILITIES: CourierProviderCapabilities = {
  authentication: true,
  serviceability: true,
  rates: true,
  booking: true,
  tracking: true,
  cancel: true,
  ndr: true,
  returns: false,
  pickupSync: true,
  labels: true, // store URL when Lorrigo returns one; may be null
  webhooks: false,
};

/**
 * Ekart Phase 3 — Durin Non-Large.
 * Cancel = RTO create / Cancel RVP. Returns = REVERSE create. Labels stay false
 * (get_label_information is metadata only). Webhooks = Critical Updates receiver
 * (runtime-gated by EKART_WEBHOOKS_ENABLED; polling remains source of truth).
 */
export const EKART_CAPABILITIES: CourierProviderCapabilities = {
  authentication: true,
  serviceability: true,
  rates: false,
  booking: true,
  tracking: true,
  cancel: true,
  ndr: false,
  returns: true,
  pickupSync: false,
  labels: false,
  webhooks: true,
};

const BY_ID: Record<CourierProviderId, CourierProviderCapabilities> = {
  velocity: VELOCITY_CAPABILITIES,
  lorrigo: LORRIGO_CAPABILITIES,
  ekart: EKART_CAPABILITIES,
};

export function getStaticProviderCapabilities(
  id: CourierProviderId
): CourierProviderCapabilities {
  return { ...BY_ID[id] };
}

export function providerSupports(
  caps: CourierProviderCapabilities,
  capability: keyof CourierProviderCapabilities
): boolean {
  return caps[capability] === true;
}
