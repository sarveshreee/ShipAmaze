/**
 * Velocity Shipping – service layer.
 * All methods call the Velocity API through velocity.client and return typed data.
 * Order-model side-effects (updating AWB, status, etc.) live in the controller.
 */

import { velocityPost } from "./velocity.client.js";
import { velocityConfig } from "./velocity.config.js";
import {
  buildVelocityRatesProviderPayload,
  normalizeRatesResponse,
  sanitizeForVelocityLog,
  buildVelocityForwardOrchestrationPayload,
  buildVelocityWarehouseProviderPayload,
  parseWarehouseCreateResponse,
  type VelocityPreparedWarehouseInput,
} from "./velocity.payload.js";
import type {
  VelocityServiceabilityRequest,
  VelocityServiceabilityResponse,
  VelocityRatesRequest,
  VelocityRatesResponse,
  VelocityForwardOrderRequest,
  VelocityForwardOrderResponse,
  VelocityCreateOrderOnlyResponse,
  VelocityCreateShipmentRequest,
  VelocityCreateShipmentResponse,
  VelocityReverseOrderRequest,
  VelocityReverseOrderResponse,
  VelocityCancelRequest,
  VelocityCancelResponse,
  VelocityTrackingRequest,
  VelocityTrackingResponse,
  VelocityShipmentsRequest,
  VelocityReturnsRequest,
  VelocityReportsRequest,
  VelocityListResponse,
} from "./velocity.types.js";

function unwrapVelocityPayload<T>(raw: unknown): T {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.payload && typeof r.payload === "object") return r.payload as T;
  }
  return raw as T;
}

/** Map Velocity forward-shipment payload keys to our internal response shape. */
export function normalizeForwardOrderResponse(raw: Record<string, unknown>): VelocityForwardOrderResponse {
  const charges = raw.charges as Record<string, unknown> | undefined;
  const frwd = charges?.frwd_charges as Record<string, unknown> | undefined;
  const rto = charges?.rto_charges as Record<string, unknown> | undefined;
  const carrierId = raw.courier_company_id ?? raw.carrier_id ?? "";
  const carrierName = String(raw.courier_name ?? raw.carrier_name ?? "");
  return {
    order_id: String(raw.order_id ?? ""),
    shipment_id: String(raw.shipment_id ?? ""),
    awb_code: String(raw.awb_code ?? ""),
    carrier_name: String(carrierName),
    carrier_id: carrierId as string | number,
    label_url: typeof raw.label_url === "string" ? raw.label_url : undefined,
    manifest_url: typeof raw.manifest_url === "string" ? raw.manifest_url : undefined,
    shipping_charges: Number(frwd?.shipping_charges ?? raw.shipping_charges ?? 0),
    cod_charges: frwd?.cod_charges != null ? Number(frwd.cod_charges) : undefined,
    rto_charges: rto?.rto_charges != null ? Number(rto.rto_charges) : undefined,
    status: String(raw.shipment_status ?? raw.status ?? "pickup_scheduled"),
    message: typeof raw.message === "string" ? raw.message : undefined,
  };
}

// ─── Warehouse ───────────────────────────────────────────

export async function createWarehouseInVelocity(input: VelocityPreparedWarehouseInput) {
  const body = buildVelocityWarehouseProviderPayload(input);
  const raw = await velocityPost<Record<string, unknown>>("/custom/api/v1/warehouse", body);
  return parseWarehouseCreateResponse(raw);
}

// ─── Serviceability ──────────────────────────────────────

export async function checkServiceability(payload: VelocityServiceabilityRequest) {
  const raw = await velocityPost<Record<string, unknown>>("/custom/api/v1/serviceability", payload);
  if (Array.isArray(raw.data)) {
    return raw as unknown as VelocityServiceabilityResponse;
  }
  const result = raw.result as Record<string, unknown> | undefined;
  const list = result?.serviceability_results;
  if (Array.isArray(list)) {
    return {
      data: list as VelocityServiceabilityResponse["data"],
      message: typeof raw.message === "string" ? raw.message : undefined,
    };
  }
  return { data: [], message: "No serviceability data in provider response" };
}

// ─── Rates ───────────────────────────────────────────────

export async function getRates(payload: VelocityRatesRequest) {
  const providerBody = buildVelocityRatesProviderPayload(payload);
  if (velocityConfig.debugLogs) {
    console.info(
      `[velocity] POST /custom/api/v1/rates provider payload (sanitized)=${JSON.stringify(sanitizeForVelocityLog(providerBody))}`
    );
  }
  const raw = await velocityPost<Record<string, unknown>>("/custom/api/v1/rates", providerBody);
  return normalizeRatesResponse(raw);
}

// ─── Forward shipment (all-in-one) ───────────────────────

export async function createForwardShipment(payload: VelocityForwardOrderRequest) {
  const providerBody = buildVelocityForwardOrchestrationPayload(payload);
  if (velocityConfig.debugLogs) {
    console.info(
      `[velocity] POST /custom/api/v1/forward-order-orchestration payload (sanitized)=${JSON.stringify(sanitizeForVelocityLog(providerBody))}`
    );
  }
  const raw = await velocityPost<unknown>(
    "/custom/api/v1/forward-order-orchestration",
    providerBody
  );
  const unwrapped = unwrapVelocityPayload<Record<string, unknown>>(raw);
  return normalizeForwardOrderResponse(unwrapped);
}

// ─── Forward order only (no AWB yet) ─────────────────────

export async function createForwardOrderOnly(payload: VelocityForwardOrderRequest) {
  const providerBody = buildVelocityForwardOrchestrationPayload(payload);
  if (velocityConfig.debugLogs) {
    console.info(
      `[velocity] POST /custom/api/v1/forward-order payload (sanitized)=${JSON.stringify(sanitizeForVelocityLog(providerBody))}`
    );
  }
  const raw = await velocityPost<unknown>(
    "/custom/api/v1/forward-order",
    providerBody
  );
  return unwrapVelocityPayload<VelocityCreateOrderOnlyResponse>(raw);
}

// ─── Assign AWB to existing forward order ────────────────

export async function createForwardShipmentLater(payload: VelocityCreateShipmentRequest) {
  return velocityPost<VelocityCreateShipmentResponse>(
    "/custom/api/v1/forward-order-shipment",
    payload
  );
}

// ─── Reverse shipment (all-in-one) ───────────────────────

export async function createReverseShipment(payload: VelocityReverseOrderRequest) {
  const raw = await velocityPost<unknown>(
    "/custom/api/v1/reverse-order-orchestration",
    payload
  );
  return unwrapVelocityPayload<VelocityReverseOrderResponse>(raw);
}

// ─── Reverse order only ───────────────────────────────────

export async function createReverseOrderOnly(payload: VelocityReverseOrderRequest) {
  return velocityPost<VelocityCreateOrderOnlyResponse>(
    "/custom/api/v1/reverse-order",
    payload
  );
}

// ─── Assign AWB to existing reverse order ────────────────

export async function createReverseShipmentLater(payload: VelocityCreateShipmentRequest) {
  return velocityPost<VelocityCreateShipmentResponse>(
    "/custom/api/v1/reverse-order-shipment",
    payload
  );
}

// ─── Cancel ──────────────────────────────────────────────

export async function cancelShipment(payload: VelocityCancelRequest) {
  return velocityPost<VelocityCancelResponse>("/custom/api/v1/cancel-order", payload);
}

// ─── Tracking ────────────────────────────────────────────

export async function trackShipment(payload: VelocityTrackingRequest) {
  return velocityPost<VelocityTrackingResponse>("/custom/api/v1/order-tracking", payload);
}

// ─── Lists / Reports ─────────────────────────────────────

export async function listShipments(payload: VelocityShipmentsRequest) {
  return velocityPost<VelocityListResponse<Record<string, unknown>>>(
    "/custom/api/v1/shipments",
    payload
  );
}

export async function listReturns(payload: VelocityReturnsRequest) {
  return velocityPost<VelocityListResponse<Record<string, unknown>>>(
    "/custom/api/v1/returns",
    payload
  );
}

export async function getReports(payload: VelocityReportsRequest) {
  return velocityPost<VelocityListResponse<Record<string, unknown>>>(
    "/custom/api/v1/reports",
    payload
  );
}
