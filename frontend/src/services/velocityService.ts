/**
 * Velocity Shipping – frontend service.
 * All calls go through the authenticated apiClient and hit our backend wrapper,
 * which proxies to Velocity. Credentials are never sent to the browser.
 */

import { apiClient } from "@/lib/apiClient";

// ─── Types ───────────────────────────────────────────────

export interface VelocityCarrier {
  carrier_id: string | number;
  carrier_name: string;
  zone?: string;
  cod?: boolean;
  tat?: string;
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

export interface VelocityTrackingActivity {
  date: string;
  activity: string;
  location: string;
}

export interface VelocityTrackingResult {
  awb: string;
  status: string;
  carrierName?: string;
  activities: VelocityTrackingActivity[];
  order?: { id: string; customer: string };
}

export interface VelocityShipmentResult {
  order_id: string;
  shipment_id: string;
  awb_code: string;
  carrier_name: string;
  carrier_id: number;
  label_url?: string;
  manifest_url?: string;
  shipping_charges: number;
  cod_charges?: number;
  rto_charges?: number;
  status: string;
}

export interface VelocityReverseResult {
  return_id?: string;
  shipment_id: string;
  awb_code: string;
  carrier_name: string;
  carrier_id: number;
  label_url?: string;
  status: string;
  reverse_charges?: number;
  qc_charges?: number;
}

export interface ServiceabilityParams {
  from: string;
  to: string;
  payment_mode: "cod" | "prepaid";
  shipment_type?: "forward" | "return";
}

export interface RatesParams {
  from: string;
  to: string;
  weight: number;
  length?: number;
  width?: number;
  height?: number;
  payment_mode: "cod" | "prepaid";
  cod_value?: number;
  shipment_type?: "forward" | "return";
  /** Returned journey only — forwarded as provider `qc_applicable`. */
  qc_applicable?: boolean;
}

export interface CreateForwardShipmentParams {
  orderId?: string;
  warehouse_id?: string | number;
  order_id?: string;
  payment_mode?: "cod" | "prepaid";
  cod_amount?: number;
  order_amount?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  customer?: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  items?: { name: string; qty: number; price: number }[];
  carrier_id?: string | number;
}

export interface CreateReverseShipmentParams {
  orderId?: string;
  warehouse_id?: string | number;
  order_id?: string;
  pickup_customer?: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  items?: { name: string; qty: number; price: number }[];
  qc?: boolean;
}

// ─── API calls ───────────────────────────────────────────

export async function checkServiceability(params: ServiceabilityParams) {
  return apiClient.post<{ success: boolean; data: VelocityCarrier[] }>(
    "/velocity/serviceability",
    params
  );
}

export async function getRates(params: RatesParams) {
  return apiClient.post<{ success: boolean; data: VelocityRate[] }>(
    "/velocity/rates",
    params
  );
}

export async function createWarehouse(params: Record<string, unknown>) {
  return apiClient.post<{ success: boolean; data: { warehouse_id: string | number } }>(
    "/velocity/warehouses",
    params
  );
}

export async function createForwardShipment(params: CreateForwardShipmentParams) {
  return apiClient.post<{ success: boolean; data: VelocityShipmentResult; orderId?: string }>(
    "/velocity/forward/create",
    params
  );
}

export async function createForwardOrderOnly(params: CreateForwardShipmentParams) {
  return apiClient.post<{ success: boolean; data: { order_id: string } }>(
    "/velocity/forward/create-order-only",
    params
  );
}

export async function assignForwardAwb(params: {
  order_id: string;
  localOrderId?: string;
  carrier_id?: string | number;
}) {
  return apiClient.post<{ success: boolean; data: VelocityShipmentResult }>(
    "/velocity/forward/create-shipment",
    params
  );
}

export async function createReverseShipment(params: CreateReverseShipmentParams) {
  return apiClient.post<{ success: boolean; data: VelocityReverseResult }>(
    "/velocity/reverse/create",
    params
  );
}

export async function createReverseOrderOnly(params: CreateReverseShipmentParams) {
  return apiClient.post<{ success: boolean; data: { order_id: string } }>(
    "/velocity/reverse/create-order-only",
    params
  );
}

export async function cancelShipment(params: { awbs: string[]; orderId?: string }) {
  return apiClient.post<{ success: boolean; data: { success: boolean; message: string } }>(
    "/velocity/cancel",
    params
  );
}

export async function trackShipment(params: { awb: string; orderId?: string }) {
  return apiClient.post<{ success: boolean; data: VelocityTrackingResult }>(
    "/velocity/track",
    params
  );
}

export async function trackShipmentPublic(awb: string) {
  return apiClient.get<{ success: boolean; data: VelocityTrackingResult }>(
    `/velocity/track/public/${encodeURIComponent(awb)}`
  );
}

export async function getVelocityShipments(params?: Record<string, unknown>) {
  return apiClient.post<{ success: boolean; data: unknown[]; total?: number }>(
    "/velocity/shipments",
    params ?? {}
  );
}

export async function getVelocityReturns(params?: Record<string, unknown>) {
  return apiClient.post<{ success: boolean; data: unknown[]; total?: number }>(
    "/velocity/returns",
    params ?? {}
  );
}

export async function getVelocityReports(params?: Record<string, unknown>) {
  return apiClient.post<{ success: boolean; data: unknown[] }>(
    "/velocity/reports",
    params ?? {}
  );
}
