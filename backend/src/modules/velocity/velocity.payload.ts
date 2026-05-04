/**
 * Builds JSON bodies matching Velocity Shipping provider contracts and safe log sanitization.
 * Field names aligned with Velocity API (rates: journey_type / origin_pincode / dead_weight / payment_method).
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import type {
  VelocityRatesRequest,
  VelocityRatesResponse,
  VelocityWarehouseResponse,
  VelocityForwardOrderRequest,
} from "./velocity.types.js";

const INDIA_MOBILE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePincode(raw: string): string {
  const s = String(raw).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(s)) throw new AppError(400, "PIN code must be exactly 6 digits");
  return s;
}

/** Indian mobile stored as 10 digits (no country code). */
export function normalizePhoneNumber10Digit(raw: string): string {
  let s = String(raw).replace(/\D/g, "");
  if (s.length === 12 && s.startsWith("91")) s = s.slice(2);
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  if (!INDIA_MOBILE.test(s))
    throw new AppError(400, "phone_number must be a valid 10-digit Indian mobile");
  return s;
}

export function assertValidEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new AppError(400, "email must be a valid address");
  return e;
}

export type VelocityPreparedWarehouseInput = {
  name: string;
  phone_number: string;
  email: string;
  contact_person: string;
  street_address: string;
  zip: string;
  city: string;
  state: string;
  country: string;
  gst_no?: string;
};

/** Build POST /custom/api/v1/rates body per Velocity contract. */
export function buildVelocityRatesProviderPayload(payload: VelocityRatesRequest): Record<string, unknown> {
  const journey_type = payload.shipment_type === "return" ? "return" : "forward";

  const out: Record<string, unknown> = {
    journey_type,
    origin_pincode: normalizePincode(payload.from),
    destination_pincode: normalizePincode(payload.to),
    dead_weight: Number(payload.weight),
    length: Number(payload.length),
    width: Number(payload.width),
    height: Number(payload.height),
    payment_method: payload.payment_mode === "cod" ? "cod" : "prepaid",
  };

  if (payload.payment_mode === "cod") {
    const v =
      payload.cod_value != null && Number(payload.cod_value) > 0 ? Number(payload.cod_value) : undefined;
    if (v != null) out.shipment_value = v;
  }

  if (journey_type === "return") {
    out.qc_applicable =
      typeof payload.qc_applicable === "boolean" ? payload.qc_applicable : false;
  }

  return out;
}

/**
 * Maps internal forward request → Velocity `forward-order-orchestration` JSON
 * (billing_* + nested customer + items + provider flags).
 */
export function buildVelocityForwardOrchestrationPayload(
  payload: VelocityForwardOrderRequest
): Record<string, unknown> {
  const c = payload.customer;
  const fullName = String(c.name ?? "").trim() || "Customer";
  const parts = fullName.split(/\s+/).filter(Boolean);
  const billing_customer_name = parts[0] ?? fullName;
  const billing_last_name = parts.length > 1 ? parts.slice(1).join(" ") : "";

  const pinDigits = String(c.pincode ?? "").replace(/\D/g, "").slice(0, 6);

  const out: Record<string, unknown> = {
    warehouse_id: payload.warehouse_id,
    order_id: payload.order_id,
    payment_mode: payload.payment_mode,
    order_amount: Number(payload.order_amount),
    weight: Number(payload.weight),
    length: Number(payload.length),
    width: Number(payload.width),
    height: Number(payload.height),
    billing_customer_name,
    billing_last_name: billing_last_name || undefined,
    billing_address: String(c.address ?? "").trim(),
    billing_city: String(c.city ?? "").trim(),
    billing_state: String(c.state ?? "").trim(),
    billing_pincode: pinDigits,
    billing_country: (c.country && String(c.country).trim()) || "India",
    billing_phone: String(c.phone ?? "").trim(),
    billing_email: c.email?.trim() ? String(c.email).trim() : undefined,
    shipping_is_billing: true,
    print_label: true,
    customer: {
      name: fullName,
      phone: String(c.phone ?? "").trim(),
      email: c.email?.trim() || undefined,
      address: String(c.address ?? "").trim(),
      city: String(c.city ?? "").trim(),
      state: String(c.state ?? "").trim(),
      pincode: pinDigits,
      country: (c.country && String(c.country).trim()) || "India",
    },
    items: payload.items,
  };

  if (payload.payment_mode === "cod" && payload.cod_amount != null && Number(payload.cod_amount) > 0) {
    out.cod_amount = Number(payload.cod_amount);
  }
  if (payload.carrier_id !== undefined && payload.carrier_id !== null && String(payload.carrier_id) !== "") {
    out.carrier_id = payload.carrier_id;
  }

  return out;
}

/** Build POST /custom/api/v1/warehouse body per Velocity contract. */
export function buildVelocityWarehouseProviderPayload(input: VelocityPreparedWarehouseInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    phone_number: input.phone_number,
    email: input.email.trim().toLowerCase(),
    contact_person: input.contact_person.trim(),
    address_attributes: {
      street_address: input.street_address.trim(),
      zip: normalizePincode(input.zip),
      city: input.city.trim(),
      state: input.state.trim(),
      country: input.country.trim() || "India",
    },
  };
  const gst = input.gst_no?.trim();
  if (gst && gst.length > 0) body.gst_no = gst.toUpperCase();
  return body;
}

function maskPhoneForLog(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length < 4) return "******";
  return `${"*".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

function maskEmailForLog(raw: string): string {
  const [local, domain] = raw.split("@");
  if (!domain) return "***";
  const l = local.length <= 2 ? "*" : `${local.slice(0, 1)}***${local.slice(-1)}`;
  return `${l}@${domain}`;
}

/** Deep-copy and mask PII suitable for stdout logs (no passwords / tokens). */
export function sanitizeForVelocityLog(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(sanitizeForVelocityLog);

  const o = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(o)) {
    const v = o[key];
    const kl = key.toLowerCase();

    if (kl.includes("phone") || kl.includes("mobile") || kl === "contact_phone") {
      out[key] = typeof v === "string" ? maskPhoneForLog(v) : v;
      continue;
    }
    if (kl.includes("email")) {
      out[key] = typeof v === "string" ? maskEmailForLog(v) : v;
      continue;
    }
    if (kl.includes("authorization") || kl.includes("password") || kl.includes("token")) {
      out[key] = "***MASKED***";
      continue;
    }

    out[key] = typeof v === "object" ? sanitizeForVelocityLog(v) : v;
  }
  return out;
}

/** Normalise Velocity success envelope → { data } for our API consumers. */
export function normalizeRatesResponse(raw: Record<string, unknown>): VelocityRatesResponse {
  if (Array.isArray(raw.data)) return raw as unknown as VelocityRatesResponse;

  const result = raw.result as Record<string, unknown> | undefined;
  if (!result) return { data: [], message: String(raw.message ?? "No rates result") };

  const serviceable = result.serviceable_couriers;
  if (Array.isArray(serviceable)) {
    const data: VelocityRatesResponse["data"] = serviceable.map((row) => {
      const r = row as Record<string, unknown>;
      const ch = (r.charges as Record<string, unknown>) ?? {};
      const ed = r.expected_delivery as Record<string, unknown> | undefined;
      const del = ed?.delivery as Record<string, unknown> | undefined;
      const tat = typeof del?.human_readable === "string" ? (del.human_readable as string) : undefined;

      const freight = Number(ch.forward_freight_charges ?? ch.freight_charge ?? 0);
      const total = Number(ch.total_forward_charges ?? ch.total_charge ?? freight);
      return {
        carrier_id: r.carrier_id as string | number,
        carrier_name: String(r.carrier_name ?? ""),
        freight_charge: freight,
        cod_charge: ch.cod_charges != null ? Number(ch.cod_charges) : undefined,
        rto_charge: ch.rto_charges != null ? Number(ch.rto_charges) : undefined,
        total_charge: total,
        zone: typeof r.zone === "string" ? r.zone : typeof r.service_level === "string" ? (r.service_level as string) : "",
        tat,
      };
    });
    return {
      data,
      message:
        typeof (raw.meta as Record<string, unknown>)?.message === "string"
          ? String((raw.meta as Record<string, unknown>).message)
          : typeof raw.message === "string"
            ? (raw.message as string)
            : undefined,
    };
  }

  if (Array.isArray(result.rates))
    return { data: result.rates as VelocityRatesResponse["data"], message: String(raw.message ?? "") };

  const list =
    result.quotes ??
    result.shipping_rates ??
    result.rates_list ??
    (Array.isArray((raw.meta as Record<string, unknown>)?.rates)
      ? (raw.meta as Record<string, unknown>).rates
      : undefined);

  if (Array.isArray(list)) return { data: list as VelocityRatesResponse["data"], message: String(raw.message ?? "") };

  return { data: [], message: "No rates data in provider response" };
}

export function parseWarehouseCreateResponse(raw: Record<string, unknown>): VelocityWarehouseResponse {
  const payloadBlock = raw.payload as Record<string, unknown> | undefined;
  const result = raw.result as Record<string, unknown> | undefined;

  let id: string | number | undefined =
    raw.warehouse_id != null ? (raw.warehouse_id as string | number) : undefined;
  if (id == null && payloadBlock?.warehouse_id != null)
    id = payloadBlock.warehouse_id as string | number;
  if (id == null && result?.warehouse_id != null) id = result.warehouse_id as string | number;

  let name: string | undefined;
  let message: string | undefined;
  if (typeof result?.name === "string") name = result.name;
  if (typeof raw.name === "string") name = raw.name as string;
  if (typeof payloadBlock?.name === "string") name = payloadBlock.name as string;
  message = (typeof raw.message === "string" ? raw.message : undefined) ?? (typeof result?.message === "string" ? (result.message as string) : undefined);
  const meta = raw.meta as Record<string, unknown> | undefined;
  if (!message && typeof meta?.message === "string") message = meta.message as string;
  const statusOk = typeof raw.status === "string" && raw.status.toUpperCase() === "SUCCESS";
  if (id != null) return { warehouse_id: id, name, message };
  if (statusOk)
    throw new AppError(502, "Velocity warehouse SUCCESS but warehouse_id missing in response");

  throw new AppError(502, "Velocity warehouse response missing warehouse_id");
}
