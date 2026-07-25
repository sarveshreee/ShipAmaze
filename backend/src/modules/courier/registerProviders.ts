/**
 * Register all courier providers once at process startup.
 * Lorrigo is registered in a later phase when LORRIGO_ENABLED is implemented.
 */

import { registerCourierProvider } from "./providerRegistry.js";
import { velocityCourierProvider } from "./providers/velocity/velocityCourierProvider.js";

let registered = false;

export function registerCourierProviders(): void {
  if (registered) return;
  registerCourierProvider(velocityCourierProvider);
  registered = true;
}
