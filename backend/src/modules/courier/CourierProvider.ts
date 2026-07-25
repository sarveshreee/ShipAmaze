import type { CourierProviderCapabilities } from "./capabilities.js";
import type {
  CourierProviderId,
  ProviderCancelInput,
  ProviderCancelResult,
  ProviderCreateShipmentInput,
  ProviderGetShipmentInput,
  ProviderPickupInput,
  ProviderPickupResult,
  ProviderCourierOption,
  ProviderRatesInput,
  ProviderServiceabilityInput,
  ProviderShipmentResult,
  ProviderSyncResult,
  ProviderTrackInput,
  ProviderTrackingResult,
} from "./types.js";

/**
 * Contract every courier integration must implement.
 * Business logic should call this interface via the provider registry — never provider-specific modules.
 */
export interface CourierProvider {
  readonly id: CourierProviderId;
  readonly displayName: string;

  /** Declared feature support — prefer this over provider-id conditionals. */
  readonly capabilities: CourierProviderCapabilities;

  /** True when credentials / config required for API calls are present. */
  isConfigured(): boolean;

  /** Obtain / refresh auth; safe to call repeatedly (uses cache). */
  authenticate(): Promise<void>;

  serviceability(input: ProviderServiceabilityInput): Promise<ProviderCourierOption[]>;

  getRates(input: ProviderRatesInput): Promise<ProviderCourierOption[]>;

  createPickup(input: ProviderPickupInput): Promise<ProviderPickupResult>;

  createShipment(input: ProviderCreateShipmentInput): Promise<ProviderShipmentResult>;

  cancelShipment(input: ProviderCancelInput): Promise<ProviderCancelResult>;

  trackShipment(input: ProviderTrackInput): Promise<ProviderTrackingResult>;

  /** Fetch shipment details by provider order id and/or AWB. */
  getShipment(input: ProviderGetShipmentInput): Promise<ProviderShipmentResult>;

  /** Background poll of active shipments → order status updates. */
  syncStatus(opts?: { batchSize?: number }): Promise<ProviderSyncResult>;

  /** Background / on-demand NDR sync into ShipAmaze NDR collection. */
  syncNDR(opts?: { daysBack?: number }): Promise<ProviderSyncResult>;
}
