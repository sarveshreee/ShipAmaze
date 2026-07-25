/**
 * Register all courier providers once at process startup.
 * Lorrigo is registered only when LORRIGO_ENABLED is true.
 */

import { registerCourierProvider } from "./providerRegistry.js";
import { velocityCourierProvider } from "./providers/velocity/velocityCourierProvider.js";
import { lorrigoCourierProvider } from "./providers/lorrigo/lorrigoCourierProvider.js";
import { isLorrigoEnabledFlag } from "../lorrigo/lorrigo.config.js";

let velocityRegistered = false;

export function registerCourierProviders(): void {
  if (!velocityRegistered) {
    registerCourierProvider(velocityCourierProvider);
    velocityRegistered = true;
  }

  // Register (or refresh) Lorrigo only when the feature flag is on.
  // When disabled, do not initialize / expose Lorrigo via the registry.
  if (isLorrigoEnabledFlag()) {
    registerCourierProvider(lorrigoCourierProvider);
  }
}

/** Test helper — allows re-running registration after clearing the registry. */
export function resetCourierProviderRegistrationForTests(): void {
  velocityRegistered = false;
}
