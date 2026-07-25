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

const BY_ID: Record<CourierProviderId, CourierProviderCapabilities> = {
  velocity: VELOCITY_CAPABILITIES,
  lorrigo: LORRIGO_CAPABILITIES,
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
