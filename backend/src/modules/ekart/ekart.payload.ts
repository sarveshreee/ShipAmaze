/**
 * Ekart Durin payload builders — Pickup → source / return_location mapping.
 * No pickup sync. Optional ekartLocationCode uses location_code when present.
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
  /** Optional future field — when set, prefer location_code over full address. */
  ekartLocationCode?: string;
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
}): string {
  const merchant = (opts.merchantCode || "XXX").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  const padded = (merchant + "XXX").slice(0, 3);
  const type = opts.reverse ? "R" : opts.paymentMode === "cod" ? "C" : "P";
  const hash = createHash("sha256").update(String(opts.orderId)).digest("hex");
  let num = "";
  for (const ch of hash) {
    if (/\d/.test(ch)) num += ch;
    if (num.length >= 10) break;
  }
  while (num.length < 10) num += "0";
  return `${padded}${type}${num.slice(0, 10)}`;
}

/** ShipAmaze order id → Durin client_reference_id (max 15). Not the tracking AWB. */
export function buildEkartClientReferenceId(orderId: string): string {
  return String(orderId ?? "")
    .trim()
    .slice(0, 15);
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
  return {
    address: {
      first_name: line(opts.firstName, "Customer"),
      address_line1: line(opts.addressLine1, "Address"),
      address_line2: line(opts.addressLine2),
      pincode: pin6(opts.pincode),
      city: line(opts.city, "City"),
      state: line(opts.state, "State"),
      primary_contact_number: phone10(opts.phone),
      ...(opts.email?.trim() ? { email_id: opts.email.trim() } : {}),
    },
  };
}

function buildSourceOrReturn(pickup: EkartPickupLean) {
  const locationCode = String(pickup.ekartLocationCode ?? "").trim();
  if (locationCode) {
    return { location_code: locationCode };
  }
  const contact = line(pickup.contactName, line(pickup.label, "Pickup"));
  const line1 = line(pickup.addressLine1, "Address");
  const line2 = [pickup.addressLine2, pickup.landmark]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return buildAddressBlock({
    firstName: contact,
    addressLine1: line1,
    addressLine2: line2 || undefined,
    pincode: pin6(pickup.pincode),
    city: line(pickup.city, "City"),
    state: line(pickup.state, "State"),
    phone: phone10(pickup.phone),
    email: pickup.email,
  });
}

export type EkartCreatePayloadBuild = {
  /** Exact JSON body for Durin POST /v2/shipments/create */
  body: Record<string, unknown>;
  /** Request client_reference_id (ShipAmaze merchant reference) */
  clientReferenceId: string;
  /** Request tracking_id sent to Durin (Flipkart-format AWB allocation) */
  trackingIdSent: string;
};

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
}): EkartCreatePayloadBuild {
  const merchant = ekartConfig.merchantCode;
  const clientReferenceId = buildEkartClientReferenceId(input.orderId);
  const trackingId =
    input.trackingId?.trim() ||
    buildEkartTrackingId({
      merchantCode: merchant,
      paymentMode: input.paymentMode,
      orderId: input.orderId,
    });

  const amountToCollect =
    input.paymentMode === "cod"
      ? Math.max(0, Math.round(Number(input.codAmount ?? input.orderAmount ?? 0)))
      : 0;

  const shipmentValue = Math.max(0, Number(input.orderAmount ?? 0));
  const items =
    input.items.length > 0
      ? input.items
      : [{ name: "Item", qty: 1, price: shipmentValue || 1 }];

  const source = buildSourceOrReturn(input.pickup);
  const returnLocation = buildSourceOrReturn(input.pickup);
  const destination = buildAddressBlock({
    firstName: input.customer.name,
    addressLine1: input.customer.address,
    addressLine2: input.customer.address2,
    pincode: input.customer.pincode,
    city: input.customer.city,
    state: input.customer.state,
    phone: input.customer.phone,
    email: input.customer.email,
  });

  const body: Record<string, unknown> = {
    client_name: merchant,
    goods_category: ekartConfig.goodsCategory,
    services: [
      {
        service_code: ekartConfig.serviceCode,
        service_details: [
          {
            service_leg: "FORWARD",
            service_data: {
              vendor_name: "Ekart",
              amount_to_collect: String(amountToCollect),
              delivery_type: "SMALL",
              source,
              destination,
              return_location: returnLocation,
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
                product_title: line(it.name, "Item").slice(0, 200),
                quantity: Math.max(1, Math.round(it.qty) || 1),
                cost: {
                  total_sale_value: String(Math.max(0, Number(it.price) || 0)),
                  total_tax_value: "0",
                  tax_breakup: { cgst: 0, sgst: 0, igst: 0 },
                },
                seller_details: {
                  seller_reg_name: line(input.pickup.label, merchant),
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

  return { body, clientReferenceId, trackingIdSent: trackingId };
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
  };
}
