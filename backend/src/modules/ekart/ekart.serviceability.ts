/**
 * Ekart serviceability — POST /v1/offerings → ProviderCourierOption[].
 */

import { randomUUID } from "crypto";
import type {
  ProviderCourierOption,
  ProviderRatesInput,
  ProviderServiceabilityInput,
} from "../courier/types.js";
import { finalizeCourierOption, parseEstimatedDays } from "../courier/normalizeCourierOption.js";
import { ekartConfig } from "./ekart.config.js";
import { ekartPost } from "./ekart.client.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseDays(sla: unknown): number | undefined {
  if (typeof sla === "number" && Number.isFinite(sla)) return sla;
  return parseEstimatedDays(String(sla ?? ""));
}

export async function fetchEkartServiceableCouriers(
  input: ProviderServiceabilityInput | ProviderRatesInput
): Promise<ProviderCourierOption[]> {
  const serviceType =
    input.shipmentType === "return" ? "REVERSE" : "FORWARD";

  const body = {
    request_id: randomUUID(),
    customer_pincode: String(input.toPincode ?? "").replace(/\D/g, "").slice(0, 6),
    seller_pincode: String(input.fromPincode ?? "").replace(/\D/g, "").slice(0, 6),
    rto_pincode: String(input.fromPincode ?? "").replace(/\D/g, "").slice(0, 6),
    length: String(input.lengthCm ?? 10),
    breadth: String(input.widthCm ?? 10),
    height: String(input.heightCm ?? 10),
    weight: String(input.weightKg ?? 0.5),
    delivery_type: "SMALL",
    service_type: serviceType,
    is_dangerous: "false",
    is_fragile: "false",
  };

  const raw = await ekartPost<unknown>(ekartConfig.serviceabilityEndpoint, body, {
    retryable: true,
  });
  const root = asRecord(raw) ?? {};
  const serviceable =
    root.serviceable === true ||
    String(root.serviceable ?? "").toLowerCase() === "true";
  if (!serviceable) return [];

  const connections = asRecord(root.connections) ?? {};
  const cod =
    root.cod === true || String(root.cod ?? "").toLowerCase() === "true";
  const out: ProviderCourierOption[] = [];

  for (const [code, meta] of Object.entries(connections)) {
    const m = asRecord(meta);
    if (!m) continue;
    const ok =
      m.serviceable === true || String(m.serviceable ?? "").toLowerCase() === "true";
    if (!ok) continue;
    const sla = m.SLA ?? m.sla;
    const finalized = finalizeCourierOption({
      courierId: `ekart:${code}`,
      courierName: `Ekart ${code}`,
      provider: "ekart",
      serviceable: true,
      tat: typeof sla === "string" ? sla : undefined,
      estimatedDays: parseDays(sla),
      codSupported: cod,
      pickupAvailable: true,
      metadata: {
        source: "ekart",
        serviceCode: code,
        lane: root.lane,
        packaging: m.packaging_requirement,
      },
    });
    if (finalized) out.push(finalized);
  }

  // If connections empty but overall serviceable, expose default service code.
  if (out.length === 0) {
    const finalized = finalizeCourierOption({
      courierId: `ekart:${ekartConfig.serviceCode}`,
      courierName: `Ekart ${ekartConfig.serviceCode}`,
      provider: "ekart",
      serviceable: true,
      codSupported: cod,
      pickupAvailable: true,
      metadata: { source: "ekart", serviceCode: ekartConfig.serviceCode },
    });
    if (finalized) out.push(finalized);
  }

  return out;
}
