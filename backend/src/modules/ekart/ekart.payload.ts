/**
 * Ekart Durin payload builders — Pickup → source / return_location mapping.
 * Address-only: Durin does not require a location_code.
 */

import { createHash } from "crypto";
import { ekartConfig } from "./ekart.config.js";

export type EkartPickupLean = {
  label?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

export type EkartCustomerLean = {
  name: string;
  phone: string;
  email?: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

export type EkartOrderItemLean = {
  name: string;
  qty: number;
  price: number;
  sku?: string;
};

function digits(raw: unknown, max: number): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, max);
}

function phone10(raw: unknown): string {
  const d = digits(raw, 15);
  return d.length >= 10 ? d.slice(-10) : d;
}

function pin6(raw: unknown): string {
  return digits(raw, 6);
}

function line(raw: unknown, fallback = ""): string {
  const s = String(raw ?? "").trim();
  return s || fallback;
}

/** Durin rejects non-ASCII in names/address with 400; also strips characters Elite cannot index. */
function asciiLine(raw: unknown, fallback = ""): string {
  const s = line(raw, fallback)
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || fallback;
}

function ekartDispatchDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Durin rejects address_line1/address_line2 over 255 chars with a 400 — hard cap outbound only. */
const EKART_ADDRESS_LINE_MAX = 255;

function addressLineCapped(raw: unknown, fallback = ""): string {
  const s = line(raw, fallback);
  return s.length > EKART_ADDRESS_LINE_MAX ? s.slice(0, EKART_ADDRESS_LINE_MAX).trim() : s;
}

/**
 * Durin CreateShipment requires a client-supplied `tracking_id` in Flipkart format:
 * {3-char merchant}{P|C|R}{10 digits}.
 *
 * This is distinct from `client_reference_id` (merchant / ShipAmaze order reference).
 * Official create response echoes `tracking_id` — it does not document a separate
 * Ekart-generated AWB field. ShipAmaze must still store:
 * - client_reference_id → ekartClientReferenceId (merchant reference)
 * - response tracking_id → awb / ekartTrackingId (never overwrite one with the other)
 */
export function buildEkartTrackingId(opts: {
  merchantCode: string;
  paymentMode: "cod" | "prepaid";
  orderId: string;
  reverse?: boolean;
  /** 1 = first book (stable hash). 2+ = reship so Durin gets a new AWB. */
  attempt?: number;
}): string {
  const merchant = (opts.merchantCode || "XXX").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  const padded = (merchant + "XXX").slice(0, 3);
  const type = opts.reverse ? "R" : opts.paymentMode === "cod" ? "C" : "P";
  const attempt = Math.max(1, Math.floor(Number(opts.attempt) || 1));
  // Attempt 1 keeps the historical seed so ghost recovery still finds first-book AWBs.
  const seed = attempt <= 1 ? String(opts.orderId) : `${opts.orderId}#${attempt}`;
  const hash = createHash("sha256").update(seed).digest("hex");
  let num = "";
  for (const ch of hash) {
    if (/\d/.test(ch)) num += ch;
    if (num.length >= 10) break;
  }
  while (num.length < 10) num += "0";
  return `${padded}${type}${num.slice(0, 10)}`;
}

/**
 * ShipAmaze order id → Durin client_reference_id (max 15). Not the tracking AWB.
 *
 * Must be unique per shipment. Naive `.slice(0, 15)` collides for long Shopify ids
 * like `shopify-…-myshopify-com-7193615565079` (all share the same 15-char prefix),
 * which Durin rejects with HTTP 400.
 */
export function buildEkartClientReferenceId(orderId: string, attempt = 1): string {
  const raw = String(orderId ?? "").trim();
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  let base: string;
  if (!raw) {
    base = createHash("sha256").update(`ekart-${Date.now()}`).digest("hex").slice(0, 15);
  } else if (raw.length <= 15) {
    base = raw;
  } else {
    // Prefer trailing numeric id (Shopify / channel order numbers) — unique within 15 chars.
    const trailingDigits = raw.match(/(\d{10,})$/)?.[1];
    base = trailingDigits ? trailingDigits.slice(-15) : createHash("sha256").update(raw).digest("hex").slice(0, 15);
  }
  if (n <= 1) return base.slice(0, 15);
  const suffix = `v${n}`;
  return `${base.slice(0, Math.max(1, 15 - suffix.length))}${suffix}`;
}

function buildAddressBlock(opts: {
  firstName: string;
  addressLine1: string;
  addressLine2?: string;
  pincode: string;
  city: string;
  state: string;
  phone: string;
  email?: string;
}) {
  // Overflow from an oversized line1 spills into line2 (also capped) instead of being lost,
  // so vendor address dumps still carry useful detail after Durin's 255-char truncation.
  const rawLine1 = line(opts.addressLine1, "Address");
  const line1 = addressLineCapped(rawLine1, "Address");
  const overflow = rawLine1.length > EKART_ADDRESS_LINE_MAX ? rawLine1.slice(EKART_ADDRESS_LINE_MAX).trim() : "";
  const line2 = addressLineCapped([overflow, line(opts.addressLine2)].filter(Boolean).join(", "));

  return {
    address: {
      first_name: asciiLine(opts.firstName, "Customer"),
      address_line1: asciiLine(line1, "Address"),
      address_line2: asciiLine(line2),
      pincode: pin6(opts.pincode),
      city: asciiLine(opts.city, "City"),
      state: asciiLine(opts.state, "State"),
      primary_contact_number: phone10(opts.phone),
      ...(opts.email?.trim() ? { email_id: opts.email.trim() } : {}),
    },
  };
}

function buildSourceOrReturn(pickup: EkartPickupLean) {
  const contact = asciiLine(pickup.contactName, asciiLine(pickup.label, "Pickup"));
  const line1 = line(pickup.addressLine1, "Address");
  const line2 = [pickup.addressLine2, pickup.landmark]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const addressBlock = buildAddressBlock({
    firstName: contact,
    addressLine1: line1,
    addressLine2: line2 || undefined,
    pincode: pin6(pickup.pincode),
    city: line(pickup.city, "City"),
    state: line(pickup.state, "State"),
    phone: phone10(pickup.phone),
    email: pickup.email,
  });

  return {
    location_type: "SELLER_PICKUP_POINT",
    location_name: asciiLine(pickup.label, contact).slice(0, 80),
    ...addressBlock,
  };
}

export type EkartCreatePayloadBuild = {
  /** Exact JSON body for Durin POST /v2/shipments/create */
  body: Record<string, unknown>;
  /** Request client_reference_id (ShipAmaze merchant reference) */
  clientReferenceId: string;
  /** Request tracking_id sent to Durin (Flipkart-format AWB allocation) */
  trackingIdSent: string;
  /** Resolved Durin service_code (e.g. REGULAR / ECONOMY) */
  serviceCode: string;
};

/**
 * Resolve Durin service_code from discovery courierId / metadata.
 * Accepts: `ekart:REGULAR`, `ekart:ECONOMY`, `REGULAR`, `ECONOMY`, or nested `ekart:ekart:ECONOMY`.
 * Falls back to EKART_SERVICE_CODE (default REGULAR).
 */
export function resolveEkartServiceCode(courierIdOrCode?: string | null): string {
  const raw = String(courierIdOrCode ?? "").trim();
  const allowed = new Set(["REGULAR", "ECONOMY", "NDD"]);
  if (!raw) return ekartConfig.serviceCode;
  const parts = raw.split(":").map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const code = parts[i].replace(/[^A-Za-z0-9_]/g, "").toUpperCase();
    if (allowed.has(code)) return code;
  }
  const fallback = ekartConfig.serviceCode.toUpperCase();
  return allowed.has(fallback) ? fallback : "REGULAR";
}

export function buildEkartCreateShipmentPayload(input: {
  orderId: string;
  paymentMode: "cod" | "prepaid";
  orderAmount: number;
  codAmount?: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  pickup: EkartPickupLean;
  customer: EkartCustomerLean;
  items: EkartOrderItemLean[];
  /** When provided by caller (tests); otherwise derived per Durin format. */
  trackingId?: string;
  /**
   * FORWARD (default) or REVERSE (RVP).
   * Durin: reverse uses service_leg REVERSE; customer is source, warehouse is destination.
   */
  serviceLeg?: "FORWARD" | "REVERSE";
  /**
   * Selected discovery courierId (e.g. ekart:ECONOMY) or raw Durin service_code.
   * Ignored for REVERSE (uses EKART_REVERSE_SERVICE_CODE).
   */
  serviceCode?: string;
  courierId?: string;
  /** Reship / retry — changes tracking_id and client_reference_id. */
  bookingAttempt?: number;
}): EkartCreatePayloadBuild {
  const merchant = ekartConfig.merchantCode;
  const serviceLeg = input.serviceLeg === "REVERSE" ? "REVERSE" : "FORWARD";
  const isReverse = serviceLeg === "REVERSE";
  const bookingAttempt = Math.max(1, Math.floor(Number(input.bookingAttempt) || 1));
  const clientReferenceId = buildEkartClientReferenceId(input.orderId, bookingAttempt);
  const trackingId =
    input.trackingId?.trim() ||
    buildEkartTrackingId({
      merchantCode: merchant,
      paymentMode: input.paymentMode,
      orderId: input.orderId,
      reverse: isReverse,
      attempt: bookingAttempt,
    });

  const amountToCollect = isReverse
    ? 0
    : input.paymentMode === "cod"
      ? Math.max(0, Math.round(Number(input.codAmount ?? input.orderAmount ?? 0)))
      : 0;

  const shipmentValue = Math.max(0, Number(input.orderAmount ?? 0));
  const items =
    input.items.length > 0
      ? input.items
      : [{ name: "Item", qty: 1, price: shipmentValue || 1 }];

  const warehouse = buildSourceOrReturn(input.pickup);
  const customerAddr = buildAddressBlock({
    firstName: input.customer.name,
    addressLine1: input.customer.address,
    addressLine2: input.customer.address2,
    pincode: input.customer.pincode,
    city: input.customer.city,
    state: input.customer.state,
    phone: input.customer.phone,
    email: input.customer.email,
  });

  // Durin REVERSE: source = customer, destination = warehouse address.
  const source = isReverse ? customerAddr : warehouse;
  const destination = isReverse ? warehouse : customerAddr;
  const returnLocation = warehouse;
  const serviceCode = isReverse
    ? ekartConfig.reverseServiceCode
    : resolveEkartServiceCode(input.serviceCode || input.courierId);

  const body: Record<string, unknown> = {
    client_name: merchant,
    goods_category: ekartConfig.goodsCategory,
    services: [
      {
        service_code: serviceCode,
        service_details: [
          {
            service_leg: serviceLeg,
            // OpenAPI ServiceDetail.tier — REGULAR / ECONOMY. Elite product filters use this.
            ...(!isReverse && (serviceCode === "REGULAR" || serviceCode === "ECONOMY")
              ? { tier: serviceCode }
              : {}),
            service_data: {
              vendor_name: "Ekart",
              amount_to_collect: String(amountToCollect),
              delivery_type: "SMALL",
              dispatch_date: ekartDispatchDate(),
              source,
              destination,
              ...(isReverse ? {} : { return_location: returnLocation }),
            },
            shipment: {
              client_reference_id: clientReferenceId,
              tracking_id: trackingId,
              shipment_value: String(shipmentValue || 1),
              shipment_dimensions: {
                length: { value: String(Math.max(1, Math.round(input.lengthCm))) },
                breadth: { value: String(Math.max(1, Math.round(input.widthCm))) },
                height: { value: String(Math.max(1, Math.round(input.heightCm))) },
                weight: { value: String(Math.max(0.1, Number(input.weightKg) || 0.5)) },
              },
              shipment_items: items.map((it, idx) => ({
                product_id: String(it.sku ?? `SKU${idx + 1}`).slice(0, 64),
                product_title: asciiLine(it.name, "Item").slice(0, 200),
                quantity: Math.max(1, Math.round(it.qty) || 1),
                cost: {
                  total_sale_value: String(Math.max(0, Number(it.price) || 0)),
                  total_tax_value: "0",
                  tax_breakup: { cgst: 0, sgst: 0, igst: 0 },
                },
                seller_details: {
                  seller_reg_name: asciiLine(input.pickup.label, merchant),
                },
                item_attributes: [
                  { name: "order_id", value: String(input.orderId) },
                  { name: "invoice_id", value: String(input.orderId) },
                ],
                handling_attributes: [
                  { name: "isFragile", value: "false" },
                  { name: "isDangerous", value: "false" },
                ],
              })),
            },
          },
        ],
      },
    ],
  };

  return { body, clientReferenceId, trackingIdSent: trackingId, serviceCode };
}

export function parseEkartCreateResponse(raw: unknown): {
  /** Response tracking_id — use as ShipAmaze AWB (do not replace with client_reference_id). */
  trackingId: string;
  status: string;
  statusCode?: number;
  message?: string;
  rejected: boolean;
  /** Response request_id */
  requestId?: string;
  /** Durin parking flag — non-NOT_PARKED may delay Elite visibility */
  isParked?: string;
} {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const requestId = typeof root.request_id === "string" ? root.request_id : undefined;
  const response = Array.isArray(root.response) ? root.response : [];
  const first =
    response[0] && typeof response[0] === "object"
      ? (response[0] as Record<string, unknown>)
      : {};

  const trackingId = String(first.tracking_id ?? "").trim();
  const status = String(first.status ?? "").trim();
  const statusCode =
    typeof first.status_code === "number" ? first.status_code : Number(first.status_code);
  const message = Array.isArray(first.message)
    ? first.message.map(String).join("; ")
    : typeof first.message === "string"
      ? first.message
      : undefined;
  const isParked =
    typeof first.is_parked === "string" ? first.is_parked.trim().toUpperCase() : undefined;

  const rejected =
    status.toUpperCase() === "REQUEST_REJECTED" ||
    (Number.isFinite(statusCode) && statusCode >= 400);

  return {
    trackingId,
    status: status || (rejected ? "REQUEST_REJECTED" : "REQUEST_RECEIVED"),
    statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    message,
    rejected,
    requestId,
    isParked,
  };
}
