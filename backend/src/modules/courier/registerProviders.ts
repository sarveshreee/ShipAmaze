/**
 * Register all courier providers once at process startup.
 * Velocity registers only when VELOCITY_ENABLED is on (default on when unset).
 * Lorrigo registers only when LORRIGO_ENABLED is true.
 */

import { registerCourierProvider } from "./providerRegistry.js";
import { velocityCourierProvider } from "./providers/velocity/velocityCourierProvider.js";
import { lorrigoCourierProvider } from "./providers/lorrigo/lorrigoCourierProvider.js";
import { isLorrigoEnabledFlag } from "../lorrigo/lorrigo.config.js";
import { isVelocityEnabledFlag } from "../../config/env.js";

let velocityRegistered = false;
let lorrigoRegistered = false;

export function registerCourierProviders(): void {
  if (isVelocityEnabledFlag()) {
    if (!velocityRegistered) {
      registerCourierProvider(velocityCourierProvider);
      velocityRegistered = true;
    }
  }

  if (isLorrigoEnabledFlag()) {
    registerCourierProvider(lorrigoCourierProvider);
    lorrigoRegistered = true;
  }
}

/** Test helper — allows re-running registration after clearing the registry. */
export function resetCourierProviderRegistrationForTests(): void {
  velocityRegistered = false;
  lorrigoRegistered = false;
}
