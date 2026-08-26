/**
 * Mirrors backend CourierProviderCapabilities for UI gating.
 * Prefer live values from GET /api/courier/providers when available.
 */

export type CourierProviderId = "velocity" | "lorrigo" | "ekart";

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

export const PROVIDER_CAPABILITIES: Record<CourierProviderId, CourierProviderCapabilities> = {
  velocity: {
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
  },
  lorrigo: {
    authentication: true,
    serviceability: true,
    rates: true,
    booking: true,
    tracking: true,
    cancel: true,
    ndr: true,
    returns: false,
    pickupSync: true,
    labels: true,
    webhooks: false,
  },
  ekart: {
    authentication: true,
    serviceability: true,
    rates: false,
    booking: true,
    tracking: true,
    cancel: false,
    ndr: false,
    returns: true,
    pickupSync: true,
    labels: false,
    webhooks: true,
  },
};

export function providerSupports(
  provider: string | undefined,
  capability: keyof CourierProviderCapabilities
): boolean {
  const id =
    provider === "lorrigo" ? "lorrigo" : provider === "ekart" ? "ekart" : "velocity";
  return PROVIDER_CAPABILITIES[id][capability] === true;
}
