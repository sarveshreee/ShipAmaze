// ────────────────────────────────────────────────────────
// Velocity Shipping API – TypeScript Types
// ────────────────────────────────────────────────────────

// Auth
export interface VelocityAuthRequest {
  username: string;
  password: string;
}

export interface VelocityAuthResponse {
  token: string;
  expires_in?: number;
}

// Serviceability
export interface VelocityServiceabilityRequest {
  from: string;
  to: string;
  payment_mode: "cod" | "prepaid";
  shipment_type: "forward" | "return";
}

export interface VelocityCarrier {
  /** Velocity returns string carrier codes (e.g. Delhivery Standard). */
  carrier_id: string | number;
  carrier_name: string;
  zone?: string;
  cod?: boolean;
  tat?: string;
  min_weight?: number;
}

export interface VelocityServiceabilityResponse {
  data: VelocityCarrier[];
  message?: string;
}

// Rates — internal (/api/velocity/rates) request; mapped to Velocity provider keys in `velocity.payload.ts`.
export interface VelocityRatesRequest {
  /** Origin pincode → provider `origin_pincode`. */
  from: string;
  /** Destination pincode → provider `destination_pincode`. */
  to: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  payment_mode: "cod" | "prepaid";
  /** COD value → provider `shipment_value` (only sent when payment is COD). */
  cod_value?: number;
  shipment_type?: "forward" | "return";
  /** Return journeys → provider `qc_applicable` when `shipment_type` is `return`. */
  qc_applicable?: boolean;
}

export interface VelocityRate {
  carrier_id: string | number;
  carrier_name: string;
  freight_charge: number;
  cod_charge?: number;
  rto_charge?: number;
  total_charge: number;
  zone?: string;
  tat?: string;
}

export interface VelocityRatesResponse {
  data: VelocityRate[];
  message?: string;
}

// Warehouse — legacy flat shape retained for typings only; provider uses nested `address_attributes` (see `velocity.payload.ts`).
export interface VelocityWarehouseRequest {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contact_name: string;
  contact_phone: string;
}

export interface VelocityWarehouseResponse {
  warehouse_id: string | number;
  name?: string;
  message?: string;
}

// Order Items / Customer (shared between forward & reverse)
export interface VelocityOrderItem {
  name: string;
  qty: number;
  price: number;
  weight?: number;
  sku?: string;
}

export interface VelocityCustomer {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

// Forward Order – full orchestration (order + AWB + label in one call)
export interface VelocityForwardOrderRequest {
  warehouse_id: string | number;
  order_id: string;
  payment_mode: "cod" | "prepaid";
  cod_amount?: number;
  order_amount: number;
  weight: number;
  length: number;
  width: number;
  height: number;
  customer: VelocityCustomer;
  items: VelocityOrderItem[];
  carrier_id?: string | number;
}

export interface VelocityForwardOrderResponse {
  order_id: string;
  shipment_id: string;
  awb_code: string;
  carrier_name: string;
  carrier_id: string | number;
  label_url?: string;
  manifest_url?: string;
  shipping_charges: number;
  cod_charges?: number;
  rto_charges?: number;
  status: string;
  message?: string;
}

// Forward Order – create order only (no AWB yet)
export interface VelocityCreateOrderOnlyResponse {
  order_id: string;
  message?: string;
}

// Forward Shipment – assign AWB to existing order
export interface VelocityCreateShipmentRequest {
  order_id: string;
  carrier_id?: string | number;
}

export interface VelocityCreateShipmentResponse {
  order_id: string;
  shipment_id: string;
  awb_code: string;
  carrier_name: string;
  carrier_id: string | number;
  label_url?: string;
  shipping_charges?: number;
  cod_charges?: number;
  status: string;
  message?: string;
}

// Cancel
export interface VelocityCancelRequest {
  awbs: string[];
}

export interface VelocityCancelResponse {
  success: boolean;
  message: string;
  failed?: string[];
}

// Tracking
export interface VelocityTrackingRequest {
  awb: string;
}

export interface VelocityTrackingActivity {
  date: string;
  activity: string;
  location: string;
}

export interface VelocityTrackingResponse {
  awb: string;
  status: string;
  carrier_name?: string;
  order_id?: string;
  shipment_track_activities: VelocityTrackingActivity[];
  message?: string;
}

// Reverse / Return
export interface VelocityReverseOrderRequest {
  warehouse_id: string | number;
  order_id: string;
  pickup_customer: VelocityCustomer;
  weight: number;
  length: number;
  width: number;
  height: number;
  items: VelocityOrderItem[];
  qc?: boolean;
}

export interface VelocityReverseOrderResponse {
  return_id?: string;
  shipment_id: string;
  awb_code: string;
  carrier_name: string;
  carrier_id: string | number;
  label_url?: string;
  status: string;
  reverse_charges?: number;
  qc_charges?: number;
  message?: string;
}

// Shipments List
export interface VelocityShipmentsRequest {
  from_date?: string;
  to_date?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

// Returns List
export interface VelocityReturnsRequest {
  from_date?: string;
  to_date?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

// Reports
export interface VelocityReportsRequest {
  from_date?: string;
  to_date?: string;
  report_type?: string;
}

// Generic paginated list response wrapper
export interface VelocityListResponse<T> {
  data: T[];
  total?: number;
  page?: number;
  per_page?: number;
  message?: string;
}

// Internal error shape returned to our clients
export interface VelocityProviderError {
  success: false;
  message: string;
  provider: "velocity";
  providerStatusCode: number;
  providerError: unknown;
}
