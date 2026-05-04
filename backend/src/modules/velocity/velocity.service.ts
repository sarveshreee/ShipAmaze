/**
 * Velocity Shipping – service layer.
 * All methods call the Velocity API through velocity.client and return typed data.
 * Order-model side-effects (updating AWB, status, etc.) live in the controller.
 */

import { velocityPost } from "./velocity.client.js";
import {
  buildVelocityRatesProviderPayload,
  buildVelocityWarehouseProviderPayload,
  normalizeRatesResponse,
  parseWarehouseCreateResponse,
  sanitizeForVelocityLog,
  type VelocityPreparedWarehouseInput,
} from "./velocity.payload.js";
import type {
  VelocityServiceabilityRequest,
  VelocityServiceabilityResponse,
  VelocityRatesRequest,
  VelocityRatesResponse,
  VelocityWarehouseResponse,
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
  console.info(
    `[velocity] POST /custom/api/v1/rates provider payload (sanitized)=${JSON.stringify(sanitizeForVelocityLog(providerBody))}`
  );
  const raw = await velocityPost<Record<string, unknown>>("/custom/api/v1/rates", providerBody);
  return normalizeRatesResponse(raw);
}

// ─── Warehouse ───────────────────────────────────────────

export async function createWarehouse(payload: VelocityPreparedWarehouseInput): Promise<VelocityWarehouseResponse> {
  const providerBody = buildVelocityWarehouseProviderPayload(payload);
  console.info(
    `[velocity] POST /custom/api/v1/warehouse provider payload (sanitized)=${JSON.stringify(sanitizeForVelocityLog(providerBody))}`
  );
  const raw = await velocityPost<Record<string, unknown>>("/custom/api/v1/warehouse", providerBody);
  return parseWarehouseCreateResponse(raw);
}

// ─── Forward shipment (all-in-one) ───────────────────────

export async function createForwardShipment(payload: VelocityForwardOrderRequest) {
  return velocityPost<VelocityForwardOrderResponse>(
    "/custom/api/v1/forward-order-orchestration",
    payload
  );
}

// ─── Forward order only (no AWB yet) ─────────────────────

export async function createForwardOrderOnly(payload: VelocityForwardOrderRequest) {
  return velocityPost<VelocityCreateOrderOnlyResponse>(
    "/custom/api/v1/forward-order",
    payload
  );
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
  return velocityPost<VelocityReverseOrderResponse>(
    "/custom/api/v1/reverse-order-orchestration",
    payload
  );
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
