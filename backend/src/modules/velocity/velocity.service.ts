/**
 * Velocity Shipping – service layer.
 * All methods call the Velocity API through velocity.client and return typed data.
 * Order-model side-effects (updating AWB, status, etc.) live in the controller.
 */

import { velocityPost } from "./velocity.client.js";
import { velocityConfig } from "./velocity.config.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import {
  buildVelocityRatesProviderPayload,
  normalizeRatesResponse,
  sanitizeForVelocityLog,
  buildVelocityForwardOrchestrationPayload,
  normalizeVelocityProviderOrderId,
  shouldPreserveVelocityOrderId,
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

/** Best-effort update of an existing Velocity warehouse (e.g. sanitize contact name for Ekart). */
export async function updateWarehouseInVelocity(
  warehouseId: string,
  input: VelocityPreparedWarehouseInput
) {
  const body = buildVelocityWarehouseProviderPayload(input, { warehouseId: warehouseId.trim() });
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
  const safePayload = { ...payload, order_id: normalizeVelocityProviderOrderId(payload.order_id) };
  const providerBody = buildVelocityForwardOrchestrationPayload(safePayload);
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

function resolveForwardOrderIdForPayload(
  orderId: string,
  opts?: { preserveExisting?: boolean }
): string {
  const raw = String(orderId ?? "").trim();
  if (opts?.preserveExisting && shouldPreserveVelocityOrderId(raw)) return raw;
  return normalizeVelocityProviderOrderId(raw);
}

export async function createForwardOrderOnly(payload: VelocityForwardOrderRequest) {
  const safePayload = { ...payload, order_id: resolveForwardOrderIdForPayload(payload.order_id) };
  const providerBody = buildVelocityForwardOrchestrationPayload(safePayload);
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

/** Update an existing Velocity forward order — preserves SA-/ORD provider order ids. */
export async function updateForwardOrderInVelocity(payload: VelocityForwardOrderRequest) {
  const safePayload = {
    ...payload,
    order_id: resolveForwardOrderIdForPayload(payload.order_id, { preserveExisting: true }),
  };
  const providerBody = buildVelocityForwardOrchestrationPayload(safePayload);
  if (velocityConfig.debugLogs) {
    console.info(
      `[velocity] POST /custom/api/v1/forward-order (update) payload (sanitized)=${JSON.stringify(sanitizeForVelocityLog(providerBody))}`
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

// ─── NDR Actions ────────────────────────────────────────

export type VelocityNdrAction = "reattempt" | "rto";

export interface VelocityNdrActionRequest {
  awb: string;
  action: VelocityNdrAction;
  phone?: string;
  remarks?: string;
}

export interface VelocityNdrActionResponse {
  success?: boolean;
  status?: string | number;
  message?: string;
  payload?: unknown;
  result?: unknown;
}

function buildVelocityNdrActionPayload(payload: VelocityNdrActionRequest) {
  const action = payload.action === "rto" ? "rto" : "reattempt_delivery";
  return {
    awb: payload.awb,
    awbs: [payload.awb],
    action,
    ndr_action: action,
    remarks: payload.remarks ?? "",
    phone: payload.phone,
  };
}

/**
 * Submit an NDR action to Velocity.
 *
 * Velocity's shared API docs provided to this project do not include an NDR action
 * endpoint. Keep the endpoint configurable so we never pretend local-only updates
 * are provider-synced.
 */
export async function submitNdrActionToVelocity(payload: VelocityNdrActionRequest) {
  const endpoint = velocityConfig.ndrActionEndpoint;
  if (!endpoint) {
    throw new AppError(
      501,
      "Velocity NDR action endpoint is not configured. Ask Velocity for the NDR re-attempt/RTO API path and set VELOCITY_NDR_ACTION_ENDPOINT."
    );
  }

  const safeEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return velocityPost<VelocityNdrActionResponse>(
    safeEndpoint,
    buildVelocityNdrActionPayload(payload)
  );
}

// ─── Tracking ────────────────────────────────────────────

/**
 * Normalize the raw Velocity tracking API response into a consistent shape.
 *
 * Velocity's tracking endpoint may differ from the forward-order endpoint:
 * - Status can be in `shipment_status` OR `status`
 * - Response may be wrapped in `{ payload: {...} }` or `{ data: [{...}] }`
 *
 * Mirrors the same resilience as `normalizeForwardOrderResponse`.
 */
function normalizeTrackingResponse(raw: unknown): VelocityTrackingResponse {
  let data = (raw != null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Unwrap { payload: { ... } } — same as forward-order responses
  if (data.payload != null && typeof data.payload === "object") {
    data = data.payload as Record<string, unknown>;
  }

  // Unwrap { result: { [awb]: { tracking_data: { shipment_status, shipment_track_activities, ... } } } }
  // This is the actual format returned by Velocity's /order-tracking endpoint.
  if (data.result != null && typeof data.result === "object" && !Array.isArray(data.result)) {
    const resultObj = data.result as Record<string, unknown>;
    const firstKey = Object.keys(resultObj)[0];
    if (firstKey) {
      const entry = resultObj[firstKey];
      if (entry != null && typeof entry === "object") {
        const entryObj = entry as Record<string, unknown>;
        const trackingData =
          entryObj.tracking_data != null && typeof entryObj.tracking_data === "object"
            ? (entryObj.tracking_data as Record<string, unknown>)
            : entryObj;
        // current_status from shipment_track[0] is the most reliable field
        const shipmentTrackFirst =
          Array.isArray(trackingData.shipment_track) && trackingData.shipment_track.length > 0
            ? (trackingData.shipment_track[0] as Record<string, unknown>)
            : null;
        data = {
          awb: firstKey,
          ...trackingData,
          shipment_status:
            trackingData.shipment_status ??
            shipmentTrackFirst?.current_status ??
            "",
          // Hoist pickup/delivered dates from shipment_track[0] for easy access
          pickup_date: trackingData.pickup_date ?? shipmentTrackFirst?.pickup_date,
          delivered_date: trackingData.delivered_date ?? shipmentTrackFirst?.delivered_date,
        };
      }
    }
  }

  // Unwrap list-style { data: [{ ... }] } — some Velocity endpoints return arrays
  if (Array.isArray(data.data) && data.data.length > 0) {
    const first = data.data[0];
    if (first != null && typeof first === "object") {
      data = first as Record<string, unknown>;
    }
  }

  // Activities: may live at shipment_track_activities or tracking_activities
  const activities =
    Array.isArray(data.shipment_track_activities)
      ? (data.shipment_track_activities as { date: string; activity: string; location: string }[])
      : Array.isArray(data.tracking_activities)
        ? (data.tracking_activities as { date: string; activity: string; location: string }[])
        : [];

  const pickupDateStr =
    typeof data.pickup_date === "string" && data.pickup_date
      ? data.pickup_date
      : typeof data.pickup_date === "number"
        ? String(data.pickup_date)
        : undefined;
  const deliveredDateStr =
    typeof data.delivered_date === "string" && data.delivered_date
      ? data.delivered_date
      : undefined;

  return {
    awb: String(data.awb ?? data.awb_code ?? ""),
    // Accept shipment_status (Velocity's forward-order field name) OR status
    status: String(data.shipment_status ?? data.status ?? ""),
    carrier_name: typeof data.carrier_name === "string" ? data.carrier_name : undefined,
    order_id: typeof data.order_id === "string" ? data.order_id : undefined,
    shipment_track_activities: activities,
    message: typeof data.message === "string" ? data.message : undefined,
    pickup_date: pickupDateStr,
    delivered_date: deliveredDateStr,
  };
}

export async function trackShipment(payload: VelocityTrackingRequest) {
  const raw = await velocityPost<unknown>("/custom/api/v1/order-tracking", payload);
  return normalizeTrackingResponse(raw);
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
