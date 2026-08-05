export type { CourierProvider } from "./CourierProvider.js";
export {
  registerCourierProvider,
  getCourierProvider,
  getCourierProviderForId,
  resolveCourierProviderId,
  listCourierProviders,
  listConfiguredCourierProviders,
  DEFAULT_COURIER_PROVIDER_ID,
  clearCourierProviderRegistryForTests,
} from "./providerRegistry.js";
export {
  registerCourierProviders,
  resetCourierProviderRegistrationForTests,
} from "./registerProviders.js";
export { discoverServiceability, discoverRates } from "./discoverCouriers.js";
export { discoveryConfig, resolveDiscoveryProviderIds } from "./discoveryConfig.js";
export { bookLorrigoShipment, bookEkartShipment, bookShipmentViaProvider } from "./bookShipment.js";
export {
  VELOCITY_CAPABILITIES,
  LORRIGO_CAPABILITIES,
  EKART_CAPABILITIES,
  getStaticProviderCapabilities,
  providerSupports,
} from "./capabilities.js";
export type { CourierProviderCapabilities } from "./capabilities.js";
export { appendProviderEvent } from "./providerEvents.js";
export { ensureCorrelationId, CURRENT_BOOKING_VERSION } from "./correlation.js";
export {
  mapLorrigoStatusToProviderCanonical,
  mapEkartStatusToProviderCanonical,
  providerCanonicalToOrderStatus,
} from "./statusNormalize.js";
export type * from "./types.js";
