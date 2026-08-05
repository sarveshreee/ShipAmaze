/**
 * Shared courier-provider types (provider-agnostic).
 * Velocity / Lorrigo / future carriers map into these shapes at the adapter boundary.
 */

export type CourierProviderId = "velocity" | "lorrigo" | "ekart";

export type ProviderPaymentMode = "cod" | "prepaid";
export type ProviderShipmentType = "forward" | "return";

export interface ProviderServiceabilityInput {
  fromPincode: string;
  toPincode: string;
  paymentMode: ProviderPaymentMode;
  shipmentType?: ProviderShipmentType;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  collectableAmount?: number;
}

export interface ProviderRatesInput {
  fromPincode: string;
  toPincode: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  paymentMode: ProviderPaymentMode;
  codValue?: number;
  shipmentType?: ProviderShipmentType;
  qcApplicable?: boolean;
}

/** Normalized courier option for UI / priority selection (all providers). */
export interface ProviderCourierOption {
  courierId: string;
  courierName: string;
  provider: CourierProviderId;
  /** Always true for options returned from a successful serviceability query. */
  serviceable: boolean;
  estimatedDays?: number;
  freight?: number;
  codSupported?: boolean;
  pickupAvailable?: boolean;
  priorityScore?: number;
  metadata?: Record<string, unknown>;
  /** Legacy aliases kept for Velocity UI compatibility. */
  zone?: string;
  /** @deprecated prefer codSupported */
  cod?: boolean;
  tat?: string;
  /** @deprecated prefer freight */
  freightCharge?: number;
  codCharge?: number;
  rtoCharge?: number;
  totalCharge?: number;
  minWeight?: number;
}

/** Discovery mode — which providers to query for serviceability / rates. */
export type CourierDiscoveryMode = "velocity" | "lorrigo" | "ekart" | "both";

export interface ProviderDiscoveryInput {
  fromPincode: string;
  toPincode: string;
  paymentMode: ProviderPaymentMode;
  shipmentType?: ProviderShipmentType;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  collectableAmount?: number;
  codValue?: number;
  qcApplicable?: boolean;
}

export interface ProviderDiscoveryProviderResult {
  provider: CourierProviderId;
  ok: boolean;
  cacheHit: boolean;
  latencyMs: number;
  courierCount: number;
  error?: string;
  timedOut?: boolean;
}

export interface ProviderDiscoveryResult {
  couriers: ProviderCourierOption[];
  providers: ProviderDiscoveryProviderResult[];
  metrics: {
    totalLatencyMs: number;
    cacheHits: number;
    cacheMisses: number;
    providerFailures: number;
    providerTimeouts: number;
    courierCount: number;
  };
}

export interface ProviderPickupInput {
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  gstNo?: string;
  /** When set, providers that support update will update instead of create. */
  existingPickupId?: string;
}

export interface ProviderPickupResult {
  pickupId: string;
  name?: string;
  message?: string;
  raw?: unknown;
}

export interface ProviderOrderItem {
  name: string;
  qty: number;
  price: number;
  sku?: string;
  discount?: number;
  tax?: number;
}

export interface ProviderCustomer {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

/**
 * Normalized create-shipment input.
 * Adapters may also accept provider-specific extras for parity with existing APIs.
 */
export interface ProviderCreateShipmentInput {
  orderId: string;
  pickupId: string;
  paymentMode: ProviderPaymentMode;
  orderAmount: number;
  codAmount?: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  customer: ProviderCustomer;
  items: ProviderOrderItem[];
  courierId?: string;
  /** Escape hatch for Velocity orchestration fields not yet normalized. */
  providerPayload?: Record<string, unknown>;
}

export interface ProviderShipmentResult {
  providerOrderId: string;
  providerShipmentId?: string;
  awb: string;
  courierId?: string;
  courierName?: string;
  labelUrl?: string;
  manifestUrl?: string;
  freightCharge?: number;
  codCharge?: number;
  rtoCharge?: number;
  status?: string;
  message?: string;
  raw?: unknown;
}

export interface ProviderCancelInput {
  /** Provider order id and/or AWB — adapters pick what their API needs. */
  providerOrderId?: string;
  awbs?: string[];
  reason?: string;
  /** Ekart: client_reference_id / merchant_reference_id when distinct from AWB. */
  merchantReferenceId?: string;
  /** Ekart: FORWARD → RTO create; REVERSE → Cancel RVP. */
  serviceLeg?: "FORWARD" | "REVERSE";
}

export interface ProviderCancelResult {
  success: boolean;
  message?: string;
  raw?: unknown;
}

export interface ProviderTrackInput {
  awb: string;
}

export interface ProviderGetShipmentInput {
  providerOrderId?: string;
  awb?: string;
}

export interface ProviderTrackingActivity {
  date: string;
  activity: string;
  location: string;
}

export interface ProviderTrackingResult {
  awb: string;
  status: string;
  courierName?: string;
  providerOrderId?: string;
  activities: ProviderTrackingActivity[];
  pickupDate?: string;
  deliveredDate?: string;
  message?: string;
  raw?: unknown;
}

export interface ProviderSyncResult {
  scanned?: number;
  updated?: number;
  errors?: number;
  message?: string;
  [key: string]: unknown;
}

/** Normalized NDR row shared across providers. */
export type ProviderNdrActionType = "reattempt" | "return" | "fake-attempt";

export interface ProviderNdrRecord {
  provider: CourierProviderId;
  awb: string;
  reason: string;
  actionRequired: boolean;
  recommendedAction?: string;
  providerStatus?: string;
  customerRemarks?: string;
  customerName?: string;
  phone?: string;
  orderId?: string;
  carrier?: string;
  amount?: number;
  attempts?: number;
  metadata?: Record<string, unknown>;
}

export interface ProviderFetchNdrInput {
  daysBack?: number;
  page?: number;
  limit?: number;
}

export interface ProviderNdrActionInput {
  awb: string;
  action: ProviderNdrActionType;
  remarks?: string;
  phone?: string;
  nextAttemptDate?: string;
  /** Escape hatch for provider-specific fields. */
  metadata?: Record<string, unknown>;
}

export interface ProviderNdrActionResult {
  success: boolean;
  message?: string;
  providerStatus?: string;
  raw?: unknown;
}
