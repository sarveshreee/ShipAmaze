/**
 * Shared normalization helpers for provider courier options.
 */

import type { CourierProviderId, ProviderCourierOption } from "./types.js";

/** Parse estimated delivery days from common TAT / ETA strings. */
export function parseEstimatedDays(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw);
  }
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;

  const range = s.match(/(\d+)\s*[-–to]+\s*(\d+)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  }

  const single = s.match(/(\d+)\s*(day|days|d\b)/);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n)) return n;
  }

  const bare = s.match(/^(\d+)$/);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n)) return n;
  }

  return undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(s)) return true;
    if (["0", "false", "no", "n"].includes(s)) return false;
  }
  return undefined;
}

/**
 * Finalize a partial option into the shared ProviderCourierOption shape.
 * Fills freight ↔ freightCharge and cod ↔ codSupported aliases.
 */
export function finalizeCourierOption(
  partial: Omit<ProviderCourierOption, "serviceable"> & { serviceable?: boolean }
): ProviderCourierOption | null {
  const courierId = String(partial.courierId ?? "").trim();
  const courierName = String(partial.courierName ?? "").trim();
  if (!courierId || !courierName) return null;

  const freight =
    partial.freight ??
    partial.freightCharge ??
    partial.totalCharge ??
    undefined;
  const freightCharge = partial.freightCharge ?? freight;
  const codSupported = partial.codSupported ?? partial.cod;
  const estimatedDays =
    partial.estimatedDays ?? parseEstimatedDays(partial.tat) ?? parseEstimatedDays(partial.metadata?.estimatedDays);

  return {
    ...partial,
    courierId,
    courierName,
    provider: partial.provider,
    serviceable: partial.serviceable !== false,
    estimatedDays,
    freight,
    freightCharge,
    codSupported,
    cod: codSupported,
    pickupAvailable: partial.pickupAvailable,
    priorityScore: partial.priorityScore,
    metadata: partial.metadata,
  };
}

export function withProvider(
  provider: CourierProviderId,
  rows: Array<Omit<ProviderCourierOption, "provider" | "serviceable"> & { serviceable?: boolean }>
): ProviderCourierOption[] {
  const out: ProviderCourierOption[] = [];
  for (const row of rows) {
    const finalized = finalizeCourierOption({ ...row, provider });
    if (finalized) out.push(finalized);
  }
  return out;
}

/** Pull a numeric field from a loose provider object. */
export function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = asNumber(obj[k]);
    if (n !== undefined) return n;
  }
  return undefined;
}

export function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

export function pickBool(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    const b = asBool(obj[k]);
    if (b !== undefined) return b;
  }
  return undefined;
}
