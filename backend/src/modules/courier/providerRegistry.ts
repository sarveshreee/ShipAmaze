import { AppError } from "../../middleware/errorMiddleware.js";
import type { CourierProvider } from "./CourierProvider.js";
import type { CourierProviderId } from "./types.js";

const providers = new Map<CourierProviderId, CourierProvider>();

/** Default provider when an order has no explicit courierProvider (backward compatible). */
export const DEFAULT_COURIER_PROVIDER_ID: CourierProviderId = "velocity";

export function registerCourierProvider(provider: CourierProvider): void {
  providers.set(provider.id, provider);
}

export function getCourierProvider(id: CourierProviderId): CourierProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new AppError(500, `Courier provider "${id}" is not registered`);
  }
  return provider;
}

/**
 * Resolve provider for an order / booking request.
 * Unknown or empty values fall back to Velocity so existing data keeps working.
 */
export function resolveCourierProviderId(
  raw: string | null | undefined
): CourierProviderId {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "lorrigo") return "lorrigo";
  if (v === "ekart") return "ekart";
  if (v === "velocity" || !v) return "velocity";
  return DEFAULT_COURIER_PROVIDER_ID;
}

export function getCourierProviderForId(
  raw: string | null | undefined
): CourierProvider {
  return getCourierProvider(resolveCourierProviderId(raw));
}

/** Configured + registered providers (for future UI / health checks). */
export function listCourierProviders(): CourierProvider[] {
  return Array.from(providers.values());
}

export function listConfiguredCourierProviders(): CourierProvider[] {
  return listCourierProviders().filter((p) => p.isConfigured());
}

/** Test helper — clears registry. */
export function clearCourierProviderRegistryForTests(): void {
  providers.clear();
}
